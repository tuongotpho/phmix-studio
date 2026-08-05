import { MemoryStore, type ClientRateLimitInfo, type Options, type Store } from 'express-rate-limit';
import { adminCredentialsUsable, adminDb } from './firebase-admin.js';

/**
 * Store đếm lượt truy cập dùng CHUNG cho mọi instance, lưu trên Firestore.
 *
 * Vì sao cần: express-rate-limit mặc định đếm trong RAM của từng tiến trình, mà
 * apphosting.yaml đặt `concurrency: 1` và `maxInstances: 10` — mỗi request rơi vào một
 * instance riêng, không instance nào biết instance kia đã phục vụ ai. Hạn mức khai báo
 * 5 lượt/phút vì thế có hiệu lực thật là 50. Đây không phải chi tiết nhỏ: ba endpoint
 * nhận tệp .docx đều KHÔNG yêu cầu đăng nhập, và hạn mức là hàng rào duy nhất của chúng.
 *
 * Chi phí: mỗi request thêm một transaction Firestore (~30–80ms). So với một lượt trộn
 * đề tốn ~25 giây CPU thì không đáng kể.
 *
 * Collection `rate_limits` không có match nào trong firestore.rules, mà Firestore từ
 * chối mặc định mọi đường dẫn không khớp rule — nên client không đọc/ghi được. Admin SDK
 * đi vòng qua rules nên vẫn ghi bình thường.
 *
 * Nên bật TTL policy trên trường `expireAt` trong Firestore console để Google tự dọn
 * document hết hạn; không bắt buộc, chỉ để collection khỏi phình theo thời gian.
 */

const COLLECTION = 'rate_limits';

/** Giữ document thêm một lúc sau khi hết cửa sổ, cho TTL policy kịp dọn. */
const RETENTION_AFTER_RESET_MS = 60_000;

export class FirestoreRateLimitStore implements Store {
  /** false = các instance dùng chung sổ, nên express-rate-limit không cảnh báo đếm đôi. */
  localKeys = false;
  prefix: string;

  private windowMs = 60_000;
  /**
   * Đường lui khi không có Admin SDK (chạy local không credential) hoặc khi Firestore
   * lỗi. Cố ý chọn "hạ cấp về đếm theo instance" thay vì trả lỗi: mất chính xác còn hơn
   * làm sập tính năng trộn đề vì sổ đếm không ghi được.
   */
  private fallback = new MemoryStore();
  private fallbackNotified = false;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.fallback.init(options);
  }

  /** Firestore cấm '/' trong ID; khoá IPv6 của ipKeyGenerator có dạng '2001:db8::/64'. */
  private docId(key: string): string {
    return Buffer.from(`${this.prefix}${key}`, 'utf-8').toString('base64url');
  }

  private useFallback(reason: string): void {
    if (!this.fallbackNotified) {
      this.fallbackNotified = true;
      console.warn(
        `[RateLimit] ${reason} — tạm đếm trong RAM của từng instance. ` +
        'Hạn mức thực tế sẽ cao gấp số instance đang chạy (xem maxInstances trong apphosting.yaml).'
      );
    }
  }

  /**
   * Firestore chỉ được dùng khi credential đã được xác minh — xem
   * adminCredentialsUsable(). Gọi thẳng khi thiếu credential sẽ làm chết tiến trình
   * bằng unhandled rejection ở tầng gRPC, không phải một lỗi bắt được.
   */
  private async db() {
    if (!(await adminCredentialsUsable())) return null;
    return adminDb();
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const db = await this.db();
    if (!db) {
      this.useFallback('Chưa cấu hình được Firebase Admin SDK');
      return this.fallback.increment(key);
    }

    const ref = db.collection(COLLECTION).doc(this.docId(key));

    try {
      return await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const now = Date.now();
        const data = snap.exists ? (snap.data() as any) : undefined;

        // Cửa sổ cũ đã hết hạn thì bắt đầu lại từ 1 thay vì cộng dồn vô hạn.
        const withinWindow = typeof data?.resetAtMs === 'number' && data.resetAtMs > now;
        const totalHits = withinWindow ? (data.hits ?? 0) + 1 : 1;
        const resetAtMs = withinWindow ? data.resetAtMs : now + this.windowMs;

        tx.set(ref, {
          hits: totalHits,
          resetAtMs,
          expireAt: new Date(resetAtMs + RETENTION_AFTER_RESET_MS)
        });

        return { totalHits, resetTime: new Date(resetAtMs) };
      });
    } catch (err: any) {
      this.useFallback(`Lỗi ghi Firestore (${err?.message || err})`);
      return this.fallback.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    const db = await this.db();
    if (!db) {
      await this.fallback.decrement(key);
      return;
    }

    const ref = db.collection(COLLECTION).doc(this.docId(key));

    try {
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data() as any;
        if (typeof data?.resetAtMs !== 'number' || data.resetAtMs <= Date.now()) return;
        tx.set(ref, { ...data, hits: Math.max(0, (data.hits ?? 0) - 1) });
      });
    } catch (err: any) {
      console.warn(`[RateLimit] Không giảm được bộ đếm cho ${key}: ${err?.message || err}`);
    }
  }

  async resetKey(key: string): Promise<void> {
    const db = await this.db();
    if (!db) {
      await this.fallback.resetKey(key);
      return;
    }

    try {
      await db.collection(COLLECTION).doc(this.docId(key)).delete();
    } catch (err: any) {
      console.warn(`[RateLimit] Không xoá được bộ đếm cho ${key}: ${err?.message || err}`);
    }
  }
}
