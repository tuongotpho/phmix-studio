import multer from 'multer';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit to prevent out-of-memory errors
  fileFilter: (_req, file, cb) => {
    if (!file.originalname || !file.originalname.toLowerCase().endsWith('.docx')) {
      return cb(new Error('Chỉ hỗ trợ định dạng tệp .docx'));
    }
    cb(null, true);
  }
});
