import express, { Request, Response, Router } from 'express';
import { requireAdmin } from '../middlewares/require-admin.js';
import { adminAuth, adminDb, adminInitError } from '../services/firebase-admin.js';
import { isAdminEmail, userRoleCache } from '../services/auth.service.js';

export const adminRouter = Router();

const jsonBody = express.json({ limit: '64kb' });

/** Số bản ghi tối đa trả về một lần — tránh kéo nguyên collection về trình duyệt. */
const USER_PAGE_LIMIT = 1000;

const VALID_PACKAGES = ['6_months', '1_year', 'lifetime', 'pending'] as const;
type Package = (typeof VALID_PACKAGES)[number];

/**
 * Hạn dùng do MÁY CHỦ tính, không nhận từ client.
 * Trước đây trình duyệt tự tính expireAt rồi ghi thẳng vào Firestore — nghĩa là
 * thời hạn gói do phía client quyết định.
 */
function expireAtFor(pkg: Package): string | null {
  const d = new Date();
  if (pkg === '6_months') {
    d.setMonth(d.getMonth() + 6);
    return d.toISOString();
  }
  if (pkg === '1_year') {
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString();
  }
  return null; // lifetime: vô hạn — pending: không có hạn
}

/** Express 5 khai báo params là string | string[] — chuẩn hoá về chuỗi. */
function paramUid(req: Request): string {
  const raw = req.params.uid as string | string[] | undefined;
  const uid = Array.isArray(raw) ? raw[0] : raw;
  return (uid ?? '').trim();
}

function services(res: Response) {
  const auth = adminAuth();
  const db = adminDb();
  if (!auth || !db) {
    res.status(503).json({
      error: 'Chức năng quản trị chưa sẵn sàng: máy chủ chưa cấu hình được Firebase Admin SDK.',
      detail: adminInitError() || undefined
    });
    return null;
  }
  return { auth, db };
}

function fail(res: Response, context: string, err: any) {
  console.error(`[Admin] ${context}:`, err?.message || err);
  res.status(500).json({ error: `Lỗi máy chủ khi ${context}.` });
}

adminRouter.get('/admin/users', requireAdmin, async (_req: Request, res: Response) => {
  const svc = services(res);
  if (!svc) return;

  try {
    const snap = await svc.db.collection('users').limit(USER_PAGE_LIMIT).get();
    const users = snap.docs.map(doc => {
      const d = doc.data() as any;
      const createdAt = d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : (d.createdAt ?? null);
      return {
        _uid: doc.id,
        email: d.email ?? '',
        displayName: d.displayName ?? '',
        status: d.status ?? 'pending',
        expireAt: d.expireAt ?? null,
        activatedAt: d.activatedAt ?? null,
        createdAt
      };
    });

    users.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

    res.json({ users, total: users.length, truncated: snap.size >= USER_PAGE_LIMIT });
  } catch (err) {
    fail(res, 'tải danh sách tài khoản', err);
  }
});

adminRouter.post('/admin/users/:uid/role', requireAdmin, jsonBody, async (req: Request, res: Response) => {
  const svc = services(res);
  if (!svc) return;

  const uid = paramUid(req);
  if (!uid) {
    res.status(400).json({ error: 'Thiếu định danh tài khoản.' });
    return;
  }
  const pkg = req.body?.package as Package | undefined;

  if (!pkg || !VALID_PACKAGES.includes(pkg)) {
    res.status(400).json({ error: `Gói không hợp lệ. Chỉ chấp nhận: ${VALID_PACKAGES.join(', ')}.` });
    return;
  }

  try {
    const ref = svc.db.collection('users').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản này.' });
      return;
    }

    const current = (snap.data() as any)?.status;
    if (current === 'admin') {
      res.status(403).json({ error: 'Không thể đổi gói của tài khoản quản trị.' });
      return;
    }

    // Bấm lại đúng gói đang có = thu hồi (giữ nguyên hành vi cũ của giao diện).
    const revoking = current === pkg;
    const target: Package = revoking ? 'pending' : pkg;

    const update = target === 'pending'
      ? { status: 'pending', activatedAt: null, expireAt: null }
      : { status: target, activatedAt: new Date().toISOString(), expireAt: expireAtFor(target) };

    await ref.update(update);
    // Xoá cache để việc duyệt/thu hồi có hiệu lực ngay, không phải chờ hết TTL 5 phút.
    userRoleCache.delete(uid);

    res.json({ success: true, status: target, expireAt: update.expireAt, revoked: revoking });
  } catch (err) {
    fail(res, 'cập nhật gói tài khoản', err);
  }
});

adminRouter.post('/admin/users/:uid/admin', requireAdmin, jsonBody, async (req: Request, res: Response) => {
  const svc = services(res);
  if (!svc) return;

  // Chỉ chủ ADMIN_EMAIL được cấp/thu hồi quyền quản trị — chặn admin thường tự nhân bản quyền.
  if (!req.adminCtx?.isOwner) {
    res.status(403).json({ error: 'Chỉ chủ tài khoản ADMIN_EMAIL mới được cấp hoặc thu hồi quyền quản trị.' });
    return;
  }

  const uid = paramUid(req);
  if (!uid) {
    res.status(400).json({ error: 'Thiếu định danh tài khoản.' });
    return;
  }
  const grant = req.body?.grant === true;

  try {
    const user = await svc.auth.getUser(uid);
    const claims = { ...(user.customClaims || {}) } as Record<string, unknown>;
    if (grant) {
      claims.admin = true;
    } else {
      delete claims.admin;
    }

    await svc.auth.setCustomUserClaims(uid, claims);
    await svc.db.collection('users').doc(uid).set(
      { status: grant ? 'admin' : 'pending' },
      { merge: true }
    );
    userRoleCache.delete(uid);

    res.json({
      success: true,
      admin: grant,
      note: 'Người dùng cần đăng nhập lại để quyền mới xuất hiện trong mã xác thực.'
    });
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      res.status(404).json({ error: 'Không tìm thấy tài khoản này trong Firebase Authentication.' });
      return;
    }
    fail(res, 'cập nhật quyền quản trị', err);
  }
});

adminRouter.delete('/admin/users/:uid', requireAdmin, async (req: Request, res: Response) => {
  const svc = services(res);
  if (!svc) return;

  const uid = paramUid(req);
  if (!uid) {
    res.status(400).json({ error: 'Thiếu định danh tài khoản.' });
    return;
  }

  if (uid === req.adminCtx?.uid) {
    res.status(400).json({ error: 'Không thể tự xoá tài khoản của chính bạn.' });
    return;
  }

  try {
    const ref = svc.db.collection('users').doc(uid);
    const snap = await ref.get();
    const data = snap.exists ? (snap.data() as any) : null;

    if (data?.status === 'admin' || isAdminEmail(data?.email)) {
      res.status(403).json({ error: 'Không thể xoá tài khoản quản trị.' });
      return;
    }

    // Xoá tài khoản Authentication TRƯỚC để người dùng không đăng nhập lại được ngay.
    // Nếu chỉ xoá document Firestore, lần đăng nhập kế tiếp sẽ tạo lại hồ sơ 'pending'.
    try {
      await svc.auth.deleteUser(uid);
    } catch (err: any) {
      if (err?.code !== 'auth/user-not-found') throw err;
      console.warn(`[Admin] ${uid} không còn trong Authentication — chỉ xoá document.`);
    }

    await ref.delete();
    userRoleCache.delete(uid);

    res.json({ success: true });
  } catch (err) {
    fail(res, 'xoá tài khoản', err);
  }
});
