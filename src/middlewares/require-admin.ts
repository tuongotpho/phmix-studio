import { Request, Response, NextFunction } from 'express';
import { adminAuth, adminInitError } from '../services/firebase-admin.js';
import { isAdminEmail } from '../services/auth.service.js';
import { extractBearerToken } from './auth.js';

/**
 * Chặn cửa mọi route quản trị.
 *
 * Chấp nhận custom claim `admin` HOẶC email trùng ADMIN_EMAIL. Nhánh thứ hai giải
 * quyết độ trễ của custom claim: sau khi được cấp claim, ID token đang có trong tay
 * người dùng chưa chứa claim đó cho tới khi hết hạn (~1 giờ). Nhờ nhánh email,
 * admin gốc dùng được ngay lập tức. Admin được cấp sau đó cần đăng nhập lại
 * (hoặc gọi getIdToken(true)) để claim xuất hiện trong token.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Bạn cần đăng nhập để dùng chức năng quản trị.' });
    return;
  }

  const auth = adminAuth();
  if (!auth) {
    res.status(503).json({
      error: 'Chức năng quản trị chưa sẵn sàng: máy chủ chưa cấu hình được Firebase Admin SDK.',
      detail: adminInitError() || undefined
    });
    return;
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    const isOwner = isAdminEmail(decoded.email);

    if (decoded.admin !== true && !isOwner) {
      res.status(403).json({ error: 'Tài khoản của bạn không có quyền quản trị.' });
      return;
    }

    req.adminCtx = { uid: decoded.uid, email: decoded.email, isOwner };
    next();
  } catch {
    res.status(401).json({ error: 'Mã xác thực không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.' });
  }
}
