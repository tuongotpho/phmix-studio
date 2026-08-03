import { Router } from 'express';
import { validateLimiter, shuffleLimiter } from '../middlewares/limiters.js';
import { attachVerifiedUser } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';
import { validateExam } from '../controllers/exam.validate.js';
import { parseDocx } from '../controllers/exam.parse.js';
import { shuffleExam } from '../controllers/exam.shuffle.js';

export const examRouter = Router();

// attachVerifiedUser phải đứng trước limiter để limiter có UID đã verify làm khoá.
examRouter.post('/validate', attachVerifiedUser, validateLimiter, upload.single('file'), validateExam);
examRouter.post('/parse-docx', attachVerifiedUser, validateLimiter, upload.single('file'), parseDocx);
examRouter.post('/shuffle', attachVerifiedUser, shuffleLimiter, upload.single('file'), shuffleExam);
