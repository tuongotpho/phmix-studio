import { jwtVerify, createRemoteJWKSet } from 'jose';

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

// Bounded LRU cache for user roles (max 5,000 entries, 5 minutes TTL)
export const userRoleCache = new LRUCache<string, CachedUserRole>(5000, 5 * 60 * 1000);

// Bounded LRU cache for last code start per user / IP (30 minutes TTL)
export const userLastCodeStartCache = new LRUCache<string, number>(2000, 30 * 60 * 1000);

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
  } catch {
    // Ignore JWKS verify error
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
      console.warn(`Firestore REST API status for ${effectiveUid}: ${response?.status || 'No response'}`);
      if (isAdminEmail(userEmail)) {
        userRoleCache.set(effectiveUid, { role: 'admin', userEmail });
        return 'admin';
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

      if (!expired && (status === 'pro' || status === 'approved' || status === '6_months' || status === '1_year' || status === 'lifetime' || status === 'active')) {
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
