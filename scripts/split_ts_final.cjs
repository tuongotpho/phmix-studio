const fs = require('fs');

let code = fs.readFileSync('src/routes/exam.routes.ts', 'utf-8');

// Find the boundaries
const validateStart = code.indexOf("examRouter.post('/validate'");
const parseDocxStart = code.indexOf("examRouter.post('/parse-docx'");
const shuffleStart = code.indexOf("examRouter.post('/shuffle'");

const imports = code.substring(0, validateStart);
const validateBody = code.substring(validateStart, parseDocxStart);
const parseDocxBody = code.substring(parseDocxStart, shuffleStart);
const shuffleBody = code.substring(shuffleStart);

// Create the controllers
const controllerImports = imports.replace("import { Router } from 'express';", "import { Request, Response } from 'express';");

// Validate Exam
let validateCode = controllerImports + '\n' + validateBody.replace("examRouter.post('/validate', validateLimiter, upload.single('file'), async (req, res) => {", "export const validateExam = async (req: Request, res: Response) => {");
validateCode = validateCode.substring(0, validateCode.lastIndexOf("});")) + "};\n";
fs.writeFileSync('src/controllers/exam.validate.ts', validateCode);

// Parse Docx
let parseDocxCode = controllerImports + '\n' + parseDocxBody.replace("examRouter.post('/parse-docx', validateLimiter, upload.single('file'), async (req, res) => {", "export const parseDocx = async (req: Request, res: Response) => {");
parseDocxCode = parseDocxCode.substring(0, parseDocxCode.lastIndexOf("});")) + "};\n";
fs.writeFileSync('src/controllers/exam.parse.ts', parseDocxCode);

// Shuffle Exam
let shuffleCode = controllerImports + '\n' + shuffleBody.replace("examRouter.post('/shuffle', shuffleLimiter, upload.single('file'), async (req, res) => {", "export const shuffleExam = async (req: Request, res: Response) => {");
shuffleCode = shuffleCode.substring(0, shuffleCode.lastIndexOf("});")) + "};\n";
fs.writeFileSync('src/controllers/exam.shuffle.ts', shuffleCode);

// Rewrite the router
const newRouter = `// @ts-nocheck
import { Router } from 'express';
import { validateLimiter, shuffleLimiter } from '../middlewares/limiters.js';
import { upload } from '../middlewares/upload.js';
import { validateExam } from '../controllers/exam.validate.js';
import { parseDocx } from '../controllers/exam.parse.js';
import { shuffleExam } from '../controllers/exam.shuffle.js';

export const examRouter = Router();

examRouter.post('/validate', validateLimiter, upload.single('file'), validateExam);
examRouter.post('/parse-docx', validateLimiter, upload.single('file'), parseDocx);
examRouter.post('/shuffle', shuffleLimiter, upload.single('file'), shuffleExam);
`;

fs.writeFileSync('src/routes/exam.routes.ts', newRouter);
console.log('Split completed successfully');
