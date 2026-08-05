import express, { Router } from 'express';
import AdmZip from 'adm-zip';
import { shuffleLimiter } from '../middlewares/limiters.js';
import { attachVerifiedUser } from '../middlewares/auth.js';
import { getUserRole } from '../services/auth.service.js';
import { parseExam, examHasQuestions } from '../shuffler/index.js';
import { generateBankExamDocxFromXml } from '../shuffler/bank.js';
import { DEFAULT_PROJECT_ID, DEFAULT_DATABASE_ID } from '../config/env.js';
import { MAX_CODES_PER_REQUEST } from '../config/limits.js';
import { buildShuffledExamZip, extractBaseDocxEntries } from '../services/shuffle-pipeline.js';

export const bankRouter = Router();

/**
 * Giới hạn body JSON cho các route ngân hàng câu hỏi.
 *
 * Trước đây khai báo 50mb nhưng vô hiệu: express.json({ limit: '2mb' }) toàn cục trong
 * server.ts chạy trước router nên body >2MB bị chặn sớm. Nay parser toàn cục đã bỏ,
 * con số này mới thực sự có hiệu lực — 50MB × concurrency 20 vượt xa 1GB RAM của
 * App Hosting, nên hạ xuống 20MB. Giới hạn 200KB/câu bên dưới vẫn giữ nguyên.
 */
const BANK_JSON_LIMIT = '20mb';

const MAX_BANK_QUESTIONS = 500;
const MAX_QUESTION_BYTES = 200_000;

/**
 * Kiểm tra danh sách câu hỏi gửi lên. Trả về thông báo lỗi (hiển thị được cho người
 * dùng) hoặc null nếu hợp lệ.
 *
 * Dùng chung cho cả /shuffle-bank lẫn /generate-base-docx — trước đây mỗi route chép
 * một bản y hệt, nên sửa hạn mức ở một chỗ là lệch ngay với chỗ kia.
 */
function validateBankQuestions(questions: unknown): string | null {
  if (!Array.isArray(questions) || questions.length === 0) {
    return 'Danh sách câu hỏi chọn rỗng!';
  }
  if (questions.length > MAX_BANK_QUESTIONS) {
    return `Vượt quá giới hạn câu hỏi (tối đa ${MAX_BANK_QUESTIONS} câu).`;
  }
  for (const q of questions) {
    if (JSON.stringify(q).length > MAX_QUESTION_BYTES) {
      return 'Một số câu hỏi có kích thước quá lớn.';
    }
  }
  return null;
}

/**
 * Xếp câu hỏi vào ba phần theo `type`.
 *
 * Danh sách bí danh dài vì dữ liệu trong ngân hàng đến từ nhiều đợt: câu nhập bằng
 * /api/parse-docx dùng 'choice' / 'true_false' / 'short_answer', còn câu soạn tay trên
 * giao diện từng lưu 'mcq', 'tf', 'fill'... Câu thiếu hẳn `type` được coi là trắc
 * nghiệm nhiều phương án.
 */
function splitQuestionsByPart(questions: any[]) {
  return {
    p1: questions.filter(q => (q.type || 'choice') === 'choice' || q.type === 'mcq'),
    p2: questions.filter(q => q.type === 'true_false' || q.type === 'tf' || q.type === 'tf_statement'),
    p3: questions.filter(
      q => q.type === 'short_answer' || q.type === 'short' || q.type === 'essay' || q.type === 'fill'
    )
  };
}

bankRouter.post('/shuffle-bank', attachVerifiedUser, shuffleLimiter, express.json({ limit: BANK_JSON_LIMIT }), async (req, res) => {
  try {
    const { title = 'Đề thi lắp ráp', num_codes = 4, code_start = 101, questions = [], shuffle_questions = true, shuffle_choices = true, shuffle_statements = true } = req.body;

    const invalid = validateBankQuestions(questions);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }

    const numCodes = parseInt(String(num_codes), 10);
    const codeStart = parseInt(String(code_start), 10);

    if (isNaN(numCodes) || numCodes <= 0) {
      res.status(400).json({ error: 'Số lượng mã đề phải lớn hơn 0!' });
      return;
    }

    if (isNaN(codeStart) || codeStart <= 0) {
      res.status(400).json({ error: 'Mã đề bắt đầu phải lớn hơn 0!' });
      return;
    }

    // Role check — danh tính lấy từ req.auth (đã verify chữ ký JWT), không tin header.
    const role = await getUserRole(req.auth?.uid, req.auth?.token, DEFAULT_PROJECT_ID, DEFAULT_DATABASE_ID);
    const isProOrAdmin = role === 'pro' || role === 'admin';

    if (!isProOrAdmin && numCodes > 2) {
      res.status(403).json({ error: 'Tài khoản chưa được kích hoạt bản PRO! Bản dùng thử giới hạn tối đa 2 mã đề.' });
      return;
    }

    if (numCodes > MAX_CODES_PER_REQUEST) {
      res.status(400).json({ error: `Số lượng mã đề tối đa mỗi lần tạo là ${MAX_CODES_PER_REQUEST}.` });
      return;
    }

    const codes: number[] = [];
    for (let i = 0; i < numCodes; i++) {
      codes.push(codeStart + i);
    }

    const { p1, p2, p3 } = splitQuestionsByPart(questions);

    // 1. Dựng đề gốc và đặt luôn vào zip kết quả để giáo viên đối chiếu.
    const baseDocxBuffer = await generateBankExamDocxFromXml(title, '', p1, p2, p3);

    const resultZip = new AdmZip();
    resultZip.addFile('De_Goc_Truoc_Khi_Tron.docx', baseDocxBuffer);

    // 2. Bóc đề gốc ra để chuẩn bị trộn.
    const docxZip = new AdmZip(baseDocxBuffer);
    const documentXmlEntry = docxZip.getEntry('word/document.xml');
    if (!documentXmlEntry) {
      throw new Error('Không thể tìm thấy word/document.xml trong đề gốc.');
    }
    const documentXmlText = documentXmlEntry.getData().toString('utf-8');
    const baseDocxEntries = extractBaseDocxEntries(docxZip);

    const examData = parseExam(documentXmlText, {});

    // Đề gốc ở đây do chính máy chủ dựng nên hiếm khi rỗng, nhưng nếu rỗng thì phải báo
    // lỗi thay vì trả về bộ zip toàn đề chưa trộn.
    if (!examHasQuestions(examData)) {
      res.status(500).json({
        error: 'Không dựng được đề gốc từ các câu hỏi đã chọn. Bộ đề chưa được tạo.',
        warnings: examData.warnings
      });
      return;
    }

    // 3. Trộn và đóng gói — dùng chung khâu với /api/shuffle.
    await buildShuffledExamZip({
      examData,
      documentXmlText,
      baseDocxEntries,
      codes,
      flags: {
        shuffleQuestions: shuffle_questions !== false,
        shuffleChoices: shuffle_choices !== false,
        shuffleStatements: shuffle_statements !== false
      },
      resultZip
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="Bo_De_Tron_Tu_Ngan_Hang.zip"');
    res.send(resultZip.toBuffer());
  } catch (error: any) {
    console.error('Error shuffling bank questions:', error);
    res.status(500).json({ error: 'Lỗi trộn đề: ' + error.message });
  }
});

bankRouter.post('/generate-base-docx', attachVerifiedUser, shuffleLimiter, express.json({ limit: BANK_JSON_LIMIT }), async (req, res) => {
  try {
    const { title = 'Đề thi gốc', questions = [] } = req.body;

    const invalid = validateBankQuestions(questions);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }

    const { p1, p2, p3 } = splitQuestionsByPart(questions);
    const baseDocxBuffer = await generateBankExamDocxFromXml(title, '', p1, p2, p3);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="De_Goc_Luu_Tru.docx"`);
    res.send(baseDocxBuffer);
  } catch (error: any) {
    console.error('Error generating base docx:', error);
    res.status(500).json({ error: 'Lỗi tạo file đề gốc: ' + error.message });
  }
});
