const fs = require('fs');

const content = fs.readFileSync('src/routes/exam.routes.ts', 'utf-8');

const validateMatch = content.match(/examRouter\.post\('\/validate', validateLimiter, upload\.single\('file'\), async \(req, res\) => \{([\s\S]*?)\}\);/);
const shuffleMatch = content.match(/examRouter\.post\('\/shuffle', shuffleLimiter, upload\.single\('file'\), async \(req, res\) => \{([\s\S]*?)\}\);/);

const imports = `import { Request, Response } from 'express';
import AdmZip from 'adm-zip';
import QRCode from 'qrcode';
import { getUserRole, userLastCodeStartCache } from '../services/auth.service.js';
import { exportTnmakerExcel, generateKeyTableDoc, buildModifiedDocxZip } from '../services/export.service.js';
import {
  parseExam,
  shuffleExamData,
  exportShuffledXml,
  getNodeText,
  getNodeTextWithMediaAndMath,
  getElementsByTagNameLocal
} from '../../shuffler.js';
import { DEFAULT_PROJECT_ID, DEFAULT_DATABASE_ID } from '../config/env.js';
`;

fs.writeFileSync('src/controllers/exam.validate.ts', imports + '\nexport const validateExam = async (req: Request, res: Response) => {' + validateMatch[1] + '};\n');
fs.writeFileSync('src/controllers/exam.shuffle.ts', imports + '\nexport const shuffleExam = async (req: Request, res: Response) => {' + shuffleMatch[1] + '};\n');

const newRoutes = `import { Router } from 'express';
import { validateLimiter, shuffleLimiter } from '../middlewares/limiters.js';
import { upload } from '../middlewares/upload.js';
import { validateExam } from '../controllers/exam.validate.js';
import { shuffleExam } from '../controllers/exam.shuffle.js';

export const examRouter = Router();

// POST endpoint for validating exam structure and finding unanswered questions
examRouter.post('/validate', validateLimiter, upload.single('file'), validateExam);

// POST endpoint for shuffling exam questions
examRouter.post('/shuffle', shuffleLimiter, upload.single('file'), shuffleExam);
`;

fs.writeFileSync('src/routes/exam.routes.ts', newRoutes);
console.log('Split completed');
