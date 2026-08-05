// PHẢI đứng trước mọi import khác: src/config/env.ts đọc process.env ngay lúc
// nạp module, nên .env phải vào process.env trước đó. Trên App Hosting / Cloud Run
// không có file .env và dotenv tự bỏ qua — biến đến từ apphosting.yaml.
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { ROOT_DIR, DEFAULT_PROJECT_ID } from './src/config/env.js';
import { examRouter } from './src/routes/exam.routes.js';
import { bankRouter } from './src/routes/bank.routes.js';
import { authRouter } from './src/routes/auth.routes.js';
import { adminRouter } from './src/routes/admin.routes.js';
import { ensureBootstrapAdminClaim } from './src/services/firebase-admin.js';

const app = express();
app.set('trust proxy', 1);
const port = Number(process.env.PORT) || 3000;

app.use(compression());

// Security Middlewares
app.use(helmet({
  contentSecurityPolicy: false,
  xFrameOptions: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginEmbedderPolicy: false
}));

const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? [(process.env.PUBLIC_URL || 'https://phmix.com')] 
  : '*';

app.use(cors({
  origin: allowedOrigins
}));

// Serve static assets from landing page
app.use(express.static(path.join(ROOT_DIR, 'landing'), { maxAge: '1d' }));

// Explicit root route handler for landing page
app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'landing', 'index.html'));
});

// Redirect /tron-de to /tron-de/ to avoid relative asset path resolution bugs
app.get('/tron-de', (req, res, next) => {
  if (req.path === '/tron-de') {
    return res.redirect(301, '/tron-de/');
  }
  next();
});

app.use('/tron-de', express.static(path.join(ROOT_DIR, 'gui'), { maxAge: '1d' }));

// Explicit route handler for /tron-de/ app
app.get('/tron-de/', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'gui', 'index.html'));
});

// Body parser được gắn theo từng router (xem src/routes/*), KHÔNG gắn toàn cục.
// Parser toàn cục 2mb trước đây chạy trước router nên vô hiệu hoá limit riêng của
// /api/shuffle-bank và /api/generate-base-docx: body >2MB bị chặn với lỗi khó hiểu.
// Các route upload .docx dùng multipart nên do multer xử lý.

// Serve favicon
app.get('/favicon.ico', (_req, res) => {
  const faviconPath = path.join(ROOT_DIR, 'landing', 'favicon.ico');
  if (fs.existsSync(faviconPath)) {
    res.sendFile(faviconPath);
  } else {
    res.sendFile(path.join(ROOT_DIR, 'shuffle.png'));
  }
});

app.get('/shuffle.png', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'shuffle.png'));
});

// Serve dynamic firebase config if it exists
app.get('/firebase-applet-config.json', (_req, res) => {
  const configPath = path.join(ROOT_DIR, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    res.sendFile(configPath);
  } else {
    res.json({ projectId: DEFAULT_PROJECT_ID });
  }
});

// Standard ping check.
// Trả kèm projectId đang dùng để xác minh nhanh cấu hình: nếu giá trị này khác
// projectId trong firebaseConfig phía client thì MỌI token đều verify thất bại
// và người dùng PRO bị hạ xuống 'guest'.
app.get('/ping', (_req, res) => {
  res.json({
    status: 'ok',
    version: '2.5.0',
    projectId: DEFAULT_PROJECT_ID,
    message: 'pH-mix Web is Running 24/7 in Node.js!'
  });
});

// Register Modular API Routers
app.use('/api', examRouter);
app.use('/api', bankRouter);
app.use('/api', authRouter);
app.use('/api', adminRouter);

// 404 cho /api/*: phải trả JSON.
// Không có handler này thì Express rơi về trang 404 mặc định dạng HTML, và phía client
// `await res.json()` ném SyntaxError khó hiểu thay vì hiện thông báo đúng nguyên nhân.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Không tìm thấy endpoint này trên máy chủ.' });
});

// Global Error Handler Middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Kích thước tệp tin vượt quá giới hạn cho phép (tối đa 15MB).' });
    }
    return res.status(400).json({ error: `Lỗi tải tệp: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ error: err.message || 'Lỗi xử lý yêu cầu.' });
  }
});

// Run server on port 3000
app.listen(port, '0.0.0.0', () => {
  console.log(`pH-mix Web applet is running on http://0.0.0.0:${port}`);
  // Cấp custom claim admin cho ADMIN_EMAIL. Idempotent, không chặn khởi động,
  // và tự bỏ qua khi chưa có credential (chạy local).
  void ensureBootstrapAdminClaim();
});
