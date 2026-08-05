import { Request } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { FirestoreRateLimitStore } from '../services/rate-limit-store.js';

/**
 * Khoá rate limit: ưu tiên UID ĐÃ verify từ JWT, nếu không thì rơi về IP.
 *
 * SEC: tuyệt đối không dùng header x-user-uid làm khoá — client tự đặt được,
 * nên chỉ cần đổi header mỗi request là vô hiệu hoá hoàn toàn rate limit.
 * Yêu cầu attachVerifiedUser phải chạy TRƯỚC limiter; nếu quên gắn thì
 * req.auth undefined và ta rơi về IP (mặc định an toàn).
 */
function uidOrIpKey(req: Request): string {
  const uid = req.auth?.uid;
  if (uid) return `uid:${uid}`;
  return `ip:${ipKeyGenerator(req.ip || 'anonymous')}`;
}

/** Khách vãng lai được hạn mức thấp hơn vì không truy vết được. */
const perUser = (authed: number, guest: number) => (req: Request) => (req.auth ? authed : guest);

/**
 * Mỗi limiter cần một prefix riêng: cả ba dùng chung collection `rate_limits`, nếu
 * không tách thì lượt kiểm tra đề và lượt trộn đề cộng dồn vào cùng một bộ đếm.
 *
 * Store nằm trên Firestore để mọi instance dùng chung sổ — xem
 * src/services/rate-limit-store.ts để biết vì sao đếm trong RAM là không đủ ở đây.
 */
export const shuffleLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: perUser(5, 2),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: uidOrIpKey,
  store: new FirestoreRateLimitStore('shuffle:'),
  message: {
    error: 'Bạn đã thực hiện trộn đề quá nhanh. Vui lòng đợi 1 phút trước khi thử lại.'
  }
});

export const validateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: perUser(10, 4),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: uidOrIpKey,
  store: new FirestoreRateLimitStore('validate:'),
  message: {
    error: 'Bạn đang gửi quá nhiều yêu cầu kiểm tra đề. Vui lòng đợi 1 phút.'
  }
});

export const notifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: uidOrIpKey,
  store: new FirestoreRateLimitStore('notify:'),
  message: {
    error: 'Bạn đang gửi thông báo quá nhanh. Vui lòng đợi 1 phút.'
  }
});
