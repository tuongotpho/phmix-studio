import { App, applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_PROJECT_ID, DEFAULT_DATABASE_ID } from '../config/env.js';

/**
 * Firebase Admin SDK — dùng cho các thao tác quản trị vượt qua security rules
 * (liệt kê user, đổi gói, cấp/thu hồi custom claim, xoá tài khoản).
 *
 * Trên Cloud Run / App Hosting, applicationDefault() lấy credential từ service
 * account của runtime, không cần key file. Service account đó cần quyền:
 *   - Firebase Authentication Admin  (setCustomUserClaims, deleteUser)
 *   - Cloud Datastore User           (đọc/ghi Firestore)
 *
 * Khởi tạo là LAZY và không bao giờ ném lỗi ra ngoài: máy chủ vẫn phải phục vụ
 * được luồng trộn đề khi chạy local không có credential. Route quản trị sẽ trả
 * 503 kèm thông báo rõ ràng thay vì làm sập tiến trình.
 */

let app: App | null = null;
let initError: string | null = null;

function ensureApp(): App | null {
  if (app) return app;
  if (initError) return null;
  try {
    const existing = getApps();
    app = existing.length > 0
      ? existing[0]
      : initializeApp({ credential: applicationDefault(), projectId: DEFAULT_PROJECT_ID });
    return app;
  } catch (err: any) {
    initError = err?.message || String(err);
    console.error('[FirebaseAdmin] Không khởi tạo được Admin SDK:', initError);
    return null;
  }
}

export function adminAuth(): Auth | null {
  const a = ensureApp();
  return a ? getAuth(a) : null;
}

export function adminDb(): Firestore | null {
  const a = ensureApp();
  if (!a) return null;
  // getFirestore(app) mặc định trỏ '(default)'; chỉ truyền databaseId khi khác.
  return DEFAULT_DATABASE_ID && DEFAULT_DATABASE_ID !== '(default)'
    ? getFirestore(a, DEFAULT_DATABASE_ID)
    : getFirestore(a);
}

export function adminInitError(): string | null {
  return initError;
}

/**
 * Cấp custom claim `admin` cho tài khoản ADMIN_EMAIL nếu chưa có.
 *
 * Đây là cách duy nhất để có admin đầu tiên mà không cần cửa hậu ở phía client —
 * chính cái cửa hậu đó (client tự ghi status:'admin') là lỗ hổng leo thang đặc quyền
 * đã được vá ở firestore.rules.
 *
 * Idempotent và không bao giờ ném lỗi: gọi được ở mỗi lần khởi động.
 */
export async function ensureBootstrapAdminClaim(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  if (!email) {
    console.warn('[FirebaseAdmin] Chưa cấu hình ADMIN_EMAIL — bỏ qua bước cấp quyền admin ban đầu.');
    return;
  }

  const auth = adminAuth();
  if (!auth) return;

  try {
    const user = await auth.getUserByEmail(email);

    if (user.customClaims?.admin !== true) {
      await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true });
      console.log(`[FirebaseAdmin] Đã cấp custom claim admin cho ${email}.`);
    }

    // Giao diện đọc quyền từ users/{uid}.status, nên phải đồng bộ để tab Quản trị hiện ra.
    const db = adminDb();
    if (db) {
      const ref = db.collection('users').doc(user.uid);
      const snap = await ref.get();
      if (!snap.exists || (snap.data() as any)?.status !== 'admin') {
        await ref.set({ email, status: 'admin' }, { merge: true });
        console.log(`[FirebaseAdmin] Đã đồng bộ hồ sơ admin cho ${email}.`);
      }
    }
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      console.warn(`[FirebaseAdmin] ADMIN_EMAIL (${email}) chưa từng đăng nhập — sẽ cấp quyền ở lần khởi động sau.`);
    } else {
      console.error('[FirebaseAdmin] Lỗi khi cấp quyền admin ban đầu:', err?.message || err);
    }
  }
}
