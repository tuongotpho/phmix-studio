import { Request, Response, NextFunction } from 'express';
import { verifyAndGetUid } from '../services/auth.service.js';
import { DEFAULT_PROJECT_ID } from '../config/env.js';

declare global {
  namespace Express {
    interface Request {
      /**
       * Danh tính ĐÃ được xác thực bằng chữ ký JWT của Firebase.
       * Chỉ được gán bởi attachVerifiedUser — không bao giờ lấy từ header do client tự khai.
       */
      auth?: { uid: string; email?: string; token: string; admin: boolean };
      /** Chỉ được gán bởi requireAdmin. isOwner = chủ tài khoản ADMIN_EMAIL. */
      adminCtx?: { uid: string; email?: string; isOwner: boolean };
    }
  }
}

export function extractBearerToken(req: Request): string | undefined {
  const header = req.headers['authorization'];
  if (typeof header !== 'string') return undefined;
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : undefined;
}

/**
 * Xác thực Bearer token (nếu có) và gắn danh tính vào req.auth.
 *
 * Cố ý KHÔNG chặn request thiếu/sai token: bản dùng thử cho khách vãng lai vẫn phải
 * chạy được. Việc phân quyền do controller quyết định qua getUserRole().
 * Điều middleware này bảo đảm là: mọi thứ phía sau chỉ nhìn thấy UID đã verify,
 * nên không thể giả mạo bằng header (trước đây x-user-uid được dùng làm khoá rate limit).
 */
export async function attachVerifiedUser(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (token) {
    const verified = await verifyAndGetUid(token, DEFAULT_PROJECT_ID);
    if (verified) {
      req.auth = { uid: verified.uid, email: verified.email, token, admin: verified.admin };
    } else {
      console.warn('[Auth] Bearer token không hợp lệ hoặc sai project ID — xử lý như khách.');
    }
  }
  next();
}
