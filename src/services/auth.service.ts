import { jwtVerify, createRemoteJWKSet } from 'jose';
import { isProStatus } from '../config/roles.js';

/**
 * Bounded LRU Cache implementation with TTL to prevent Out-Of-Memory memory leaks
 */
export class LRUCache<K, V> {
  private cache = new Map<K, { value: V; expiresAt: number }>();
  private maxCapacity: number;
  private ttlMs: number;

  constructor(maxCapacity: number = 5000, ttlMs: number = 5 * 60 * 1000) {
    this.maxCapacity = maxCapacity;
    this.ttlMs = ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Refresh position for LRU eviction order
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, customTtlMs?: number): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxCapacity) {
      // Evict oldest item
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    const expiresAt = Date.now() + (customTtlMs ?? this.ttlMs);
    this.cache.set(key, { value, expiresAt });
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export type UserRole = 'basic' | 'pro' | 'admin' | 'guest';

interface CachedUserRole {
  role: UserRole;
  userEmail?: string;
}

/**
 * Cache vai trò người dùng (tối đa 5.000 mục).
 *
 * TTL 60 giây, KHÔNG phải 5 phút. Cache này nằm trong RAM của từng instance, mà
 * apphosting.yaml đặt maxInstances: 10 — nên userRoleCache.delete() trong
 * admin.routes.ts chỉ dọn được instance vừa phục vụ thao tác quản trị đó. Chín instance
 * còn lại vẫn cấp quyền theo giá trị cũ cho tới khi hết TTL. Với 5 phút, việc thu hồi
 * một tài khoản vi phạm gần như không có hiệu lực tức thì như ghi chú ở đó khẳng định.
 *
 * 60 giây là mức đánh đổi: mỗi người dùng đang thao tác phát sinh thêm khoảng một lần
 * đọc Firestore mỗi phút — không đáng kể so với một request trộn đề tốn 25 giây CPU.
 * Muốn bỏ hẳn độ trễ thì phải chuyển vai trò PRO sang custom claim như quyền admin,
 * khi đó thông tin nằm trong chính token và không cần cache.
 */
export const userRoleCache = new LRUCache<string, CachedUserRole>(5000, 60 * 1000);


// Endpoint JWKS chính thức cho Firebase ID token. Đường dẫn phải đúng tuyệt đối:
// createRemoteJWKSet nạp key lazy nên URL sai không làm sập lúc khởi động, mà khiến
// MỌI lần jwtVerify() ném lỗi — hậu quả là mọi tài khoản đều bị hạ xuống 'guest'
// và tính năng PRO/admin im lặng ngừng hoạt động.
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

/**
 * So khớp email admin an toàn.
 * Lưu ý: KHÔNG so sánh trực tiếp `email === process.env.ADMIN_EMAIL` — nếu cả hai
 * cùng undefined (ADMIN_EMAIL chưa cấu hình và token không có claim email) thì
 * phép so sánh trả về true và cấp nhầm quyền admin.
 */
export function isAdminEmail(email: string | undefined): boolean {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || !email) return false;
  return email.toLowerCase() === adminEmail.toLowerCase();
}

/**
 * Token hỏng phía người dùng — chuyện thường ngày (hết hạn, khách vãng lai, token
 * bị sửa). Không log để khỏi ngập Cloud Run logs.
 */
const EXPECTED_TOKEN_ERRORS = new Set([
  'ERR_JWT_EXPIRED',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWS_INVALID',
  'ERR_JWT_INVALID'
]);

// Lỗi hạ tầng lặp lại ở MỌI request, nên chỉ log lại sau mỗi 60s cho từng mã lỗi.
const tokenErrorLoggedAt = new Map<string, number>();
const TOKEN_ERROR_LOG_INTERVAL_MS = 60_000;

/**
 * Phân biệt "token của người dùng không hợp lệ" với "hệ thống đang hỏng".
 *
 * Trước đây khối catch ở đây rỗng kèm comment "Ignore JWKS verify error", nên một
 * URL JWKS sai đã âm thầm hạ MỌI tài khoản xuống 'guest' và tắt tính năng PRO/admin
 * mà không để lại dấu vết nào trong log.
 */
function reportTokenVerifyFailure(err: unknown): void {
  const code = (err as any)?.code || (err as any)?.name || 'UNKNOWN';
  if (EXPECTED_TOKEN_ERRORS.has(code)) return;

  const now = Date.now();
  if (now - (tokenErrorLoggedAt.get(code) ?? 0) < TOKEN_ERROR_LOG_INTERVAL_MS) return;
  tokenErrorLoggedAt.set(code, now);

  console.error(
    `[Auth] Không verify được ID token do lỗi hạ tầng (${code}): ${(err as any)?.message}. ` +
    'Trong khi lỗi này còn, MỌI tài khoản đều bị hạ xuống "guest" và tính năng PRO/admin ngừng hoạt động. ' +
    'Kiểm tra endpoint JWKS và FIREBASE_PROJECT_ID (xem GET /ping).'
  );
}

export async function verifyAndGetUid(
  idToken: string,
  projectId: string
): Promise<{ uid: string; email?: string; admin: boolean } | null> {
  if (!idToken) return null;
  const cleanToken = idToken.replace(/^Bearer\s+/i, '').trim();
  if (!cleanToken) return null;

  try {
    const { payload } = await jwtVerify(cleanToken, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    const uid = (payload.user_id || payload.sub || null) as string | null;
    if (uid) {
      return {
        uid,
        email: payload.email as string | undefined,
        // Custom claim do Admin SDK cấp — nguồn quyền admin chuẩn.
        admin: payload.admin === true
      };
    }
  } catch (err) {
    reportTokenVerifyFailure(err);
  }

  return null;
}

/**
 * SEC-1 FIX: Securely resolves user role.
 * Never trusts x-user-uid header alone.
 * If idToken is provided, identity MUST be verified from the JWT token.
 * If token UID differs from client-provided UID, verified UID is enforced.
 * Unauthenticated calls (no valid idToken) return 'guest'.
 */
export async function getUserRole(
  requestedUid: string | undefined,
  idToken: string | undefined,
  projectId: string,
  databaseId: string = '(default)'
): Promise<UserRole> {
  let effectiveUid: string | undefined;
  let userEmail: string | undefined;
  let hasAdminClaim = false;

  if (idToken) {
    const verified = await verifyAndGetUid(idToken, projectId);
    if (verified) {
      effectiveUid = verified.uid;
      userEmail = verified.email;
      hasAdminClaim = verified.admin;

      if (requestedUid && requestedUid !== verified.uid) {
        console.warn(
          `[Security Guard] Header/Request UID mismatch detected. Header: ${requestedUid}, Verified Token UID: ${verified.uid}. Enforcing token UID.`
        );
      }
    } else {
      // Token was provided but failed verification
      return 'guest';
    }
  } else {
    // No idToken provided: Cannot elevate rights for unauthenticated requester
    return 'guest';
  }

  if (!effectiveUid) {
    return 'guest';
  }

  // Custom claim `admin` do Admin SDK cấp — kiểm tra trước cache và trước Firestore.
  if (hasAdminClaim) {
    userRoleCache.set(effectiveUid, { role: 'admin', userEmail });
    return 'admin';
  }

  // Check cache first
  const cached = userRoleCache.get(effectiveUid);
  if (cached) {
    return cached.role;
  }

  // Admin email override
  if (isAdminEmail(userEmail)) {
    userRoleCache.set(effectiveUid, { role: 'admin', userEmail });
    return 'admin';
  }

  try {
    const cleanToken = idToken.replace(/^Bearer\s+/i, '').trim();
    let response: Response | null = null;

    if (cleanToken) {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/users/${effectiveUid}`;
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${cleanToken}` }
      }).catch(() => null);

      if (response && !response.ok && databaseId !== '(default)') {
        const fallbackUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${effectiveUid}`;
        const fallbackResp = await fetch(fallbackUrl, {
          headers: { Authorization: `Bearer ${cleanToken}` }
        }).catch(() => null);
        if (fallbackResp && fallbackResp.ok) {
          response = fallbackResp;
        }
      }
    }

    if (!response || !response.ok) {
      if (isAdminEmail(userEmail)) {
        userRoleCache.set(effectiveUid, { role: 'admin', userEmail });
        return 'admin';
      }

      // Phân biệt "chưa có hồ sơ" với "hệ thống đang hỏng".
      //
      // 404 là chuyện bình thường: tài khoản vừa đăng ký, document users/{uid} chưa
      // được tạo — 'basic' là câu trả lời ĐÚNG, không cần ồn ào.
      //
      // Còn 5xx hoặc mất mạng thì ta KHÔNG biết người này có quyền gì, và việc trả
      // 'basic' âm thầm hạ một tài khoản PRO đang trả tiền xuống bản dùng thử 2 mã đề.
      // Phải log ở mức error để còn lần ra được khi có người báo "tự nhiên mất PRO".
      // Cố ý không ghi vào cache ở nhánh này: hạ cấp nhầm mà còn nhớ suốt TTL thì tệ
      // hơn nhiều so với việc hỏi lại Firestore ở request kế tiếp.
      const status = response?.status;
      if (status === 404) {
        console.warn(`[Auth] Chưa có hồ sơ users/${effectiveUid} — xếp vào 'basic'.`);
      } else {
        console.error(
          `[Auth] Không đọc được vai trò của ${effectiveUid} (${status ?? 'không có phản hồi'}). ` +
          'Tài khoản này tạm bị hạ xuống "basic"; nếu người dùng có gói PRO thì đây là hạ cấp NHẦM ' +
          'do lỗi hạ tầng, không phải do hết hạn. Kiểm tra kết nối Firestore.'
        );
      }
      return 'basic';
    }

    const doc: any = await response.json();
    const status = doc.fields?.status?.stringValue || 'pending';
    let role: UserRole = 'basic';

    // SEC: chỉ so khớp email lấy từ payload JWT đã verify, KHÔNG dùng field email
    // trong document Firestore — user tự ghi được field đó, nên chỉ cần đặt
    // email = ADMIN_EMAIL là chiếm được quyền admin.
    // `status` vẫn được tin vì firestore.rules đã chặn user tự đặt/sửa trường này;
    // sẽ thay hẳn bằng custom claim khi có Admin SDK.
    if (status === 'admin' || isAdminEmail(userEmail)) {
      role = 'admin';
    } else {
      const expireAt = doc.fields?.expireAt?.stringValue;
      let expired = false;
      if (expireAt) {
        const expireDate = new Date(expireAt);
        if (expireDate < new Date()) {
          console.warn(`User ${effectiveUid} has expired. Expiration: ${expireAt}. Downgrading to basic.`);
          expired = true;
        }
      }

      if (!expired && isProStatus(status)) {
        role = 'pro';
      }
    }

    userRoleCache.set(effectiveUid, { role, userEmail });
    return role;
  } catch (err) {
    console.error(`Error fetching user role for ${effectiveUid}:`, err);
    if (isAdminEmail(userEmail)) {
      return 'admin';
    }
    return 'basic';
  }
}
