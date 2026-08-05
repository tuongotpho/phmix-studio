import express, { Router } from 'express';
import { notifyLimiter } from '../middlewares/limiters.js';
import { attachVerifiedUser } from '../middlewares/auth.js';
import { notifyAdminOfNewUser } from '../services/notifier.js';

export const authRouter = Router();

authRouter.post(
  '/notify-new-registration',
  attachVerifiedUser,
  notifyLimiter,
  express.json({ limit: '64kb' }),
  async (req, res) => {
    try {
      const { displayName, uid } = req.body ?? {};

      if (!req.auth) {
        res.status(401).json({ error: 'Không tìm thấy mã xác thực. Bạn cần đăng nhập để gửi thông báo.' });
        return;
      }

      if (uid && uid !== req.auth.uid) {
        res.status(403).json({ error: 'Yêu cầu bị từ chối: Mã xác thực không khớp với tài khoản đăng ký.' });
        return;
      }

      // Chỉ tin email/uid lấy từ payload token; status luôn là 'pending' vì
      // tài khoản mới không thể tự chọn trạng thái (xem firestore.rules).
      notifyAdminOfNewUser({
        email: req.auth.email || '',
        displayName: typeof displayName === 'string' ? displayName.slice(0, 100) : '',
        uid: req.auth.uid,
        status: 'pending'
      }).catch(err => console.error('Error sending registration notification:', err));

      res.json({ success: true, message: 'Đang gửi thông báo đăng ký tới Admin...' });
    } catch (error: any) {
      console.error('Error in notify-new-registration endpoint:', error);
      res.status(500).json({ error: 'Lỗi thông báo đăng ký.' });
    }
  }
);
