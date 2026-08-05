import { adminCredentialsUsable, adminDb } from './firebase-admin.js';

/**
 * Khoá "mỗi người một lượt trộn tại một thời điểm", dùng chung cho mọi instance.
 *
 * Trước đây khoá là một `Set` trong RAM của controller. Với `concurrency: 1` và
 * `maxInstances: 10` (apphosting.yaml), mười request song song của cùng một người rơi
 * vào mười instance khác nhau và không cái nào thấy khoá của cái nào — khoá gần như
 * không có tác dụng, trong khi mỗi lượt trộn chiếm trọn một vCPU suốt ~25 giây.
 *
 * Collection `shuffle_locks` không khớp match nào trong firestore.rules nên client không
 * chạm tới được; Admin SDK đi vòng qua rules.
 */

const COLLECTION = 'shuffle_locks';

/**
 * Thời gian sống của khoá.
 *
 * Phải DÀI hơn lượt trộn chậm nhất (đo được ~26 giây ở mức trần 24 mã đề) để không tự
 * mở khoá giữa chừng, nhưng đủ NGẮN để một instance chết đột ngột — lúc đó khối
 * `finally` không kịp chạy — không khoá người dùng lại quá lâu. 3 phút thoả cả hai.
 *
 * Khoá này là hàng rào công bằng và bảo vệ tài nguyên, không phải điều kiện đúng đắn:
 * nếu nó hết hạn sớm trong một trường hợp cực đoan thì hậu quả chỉ là hai lượt trộn
 * chạy song song, không phải kết quả sai.
 */
const LOCK_TTL_MS = 3 * 60 * 1000;

/** Đường lui khi chạy local không có Admin SDK — giữ đúng hành vi cũ. */
const localLocks = new Set<string>();
let fallbackNotified = false;

function notifyFallback(): void {
  if (!fallbackNotified) {
    fallbackNotified = true;
    console.warn(
      '[ShuffleLock] Chưa cấu hình được Firebase Admin SDK — khoá chỉ có hiệu lực trong ' +
      'một instance. Chấp nhận được khi chạy local, KHÔNG đủ trên App Hosting nhiều instance.'
    );
  }
}

function docId(key: string): string {
  return Buffer.from(key, 'utf-8').toString('base64url');
}

/**
 * Chỉ chạm Firestore khi credential đã được xác minh: thiếu credential thì lời gọi đầu
 * tiên làm chết tiến trình bằng unhandled rejection ở tầng gRPC (xem
 * adminCredentialsUsable), chứ không ném lỗi bắt được.
 */
async function lockDb() {
  if (!(await adminCredentialsUsable())) return null;
  return adminDb();
}

/** true = giành được khoá và bên gọi có trách nhiệm gọi releaseShuffleLock(). */
export async function acquireShuffleLock(key: string): Promise<boolean> {
  const db = await lockDb();
  if (!db) {
    notifyFallback();
    if (localLocks.has(key)) return false;
    localLocks.add(key);
    return true;
  }

  const ref = db.collection(COLLECTION).doc(docId(key));

  try {
    return await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const data = snap.exists ? (snap.data() as any) : undefined;

      if (typeof data?.expiresAtMs === 'number' && data.expiresAtMs > now) {
        return false;
      }

      tx.set(ref, {
        expiresAtMs: now + LOCK_TTL_MS,
        expireAt: new Date(now + LOCK_TTL_MS)
      });
      return true;
    });
  } catch (err: any) {
    // Firestore hỏng thì CHO QUA thay vì chặn: khoá là lớp bảo vệ phụ, còn rate limit
    // mới là hàng rào chính. Chặn hết người dùng vì sổ khoá không ghi được là đánh đổi sai.
    console.error(`[ShuffleLock] Không giành được khoá cho ${key}: ${err?.message || err}`);
    return true;
  }
}

export async function releaseShuffleLock(key: string): Promise<void> {
  const db = await lockDb();
  if (!db) {
    localLocks.delete(key);
    return;
  }

  try {
    await db.collection(COLLECTION).doc(docId(key)).delete();
  } catch (err: any) {
    // Không sao: khoá sẽ tự hết hạn sau LOCK_TTL_MS.
    console.warn(`[ShuffleLock] Không xoá được khoá ${key}: ${err?.message || err}`);
  }
}
