import express, { Router } from 'express';
import AdmZip from 'adm-zip';
import QRCode from 'qrcode';
import { shuffleLimiter } from '../middlewares/limiters.js';
import { attachVerifiedUser } from '../middlewares/auth.js';
import { getUserRole } from '../services/auth.service.js';
import { exportTnmakerExcel, generateKeyTableDoc, buildModifiedDocxZip, generateTnmakerAnswersAndQr } from '../services/export.service.js';
import { parseExam, shuffleExamData, exportShuffledXml } from '../../shuffler.js';
import { generateBankExamDocxFromXml } from '../../bank-shuffler.js';
import { DEFAULT_PROJECT_ID, DEFAULT_DATABASE_ID } from '../config/env.js';
import { MAX_CODES_PER_REQUEST } from '../config/limits.js';

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

bankRouter.post('/shuffle-bank', attachVerifiedUser, shuffleLimiter, express.json({ limit: BANK_JSON_LIMIT }), async (req, res) => {
  try {
    const { title = 'Đề thi lắp ráp', num_codes = 4, code_start = 101, questions = [], shuffle_questions = true, shuffle_choices = true, shuffle_statements = true } = req.body;

    if (!Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ error: 'Danh sách câu hỏi chọn rỗng!' });
      return;
    }
    if (questions.length > 500) {
      res.status(400).json({ error: 'Vượt quá giới hạn câu hỏi (tối đa 500 câu).' });
      return;
    }
    for (const q of questions) {
      if (JSON.stringify(q).length > 200000) {
        res.status(400).json({ error: 'Một số câu hỏi có kích thước quá lớn.' });
        return;
      }
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

    const p1 = questions.filter(q => (q.type || 'choice') === 'choice' || q.type === 'mcq');
    const p2 = questions.filter(q => q.type === 'true_false' || q.type === 'tf' || q.type === 'tf_statement');
    const p3 = questions.filter(q => q.type === 'short_answer' || q.type === 'short' || q.type === 'essay' || q.type === 'fill');

    // 1. Generate the base docx
    const baseDocxBuffer = await generateBankExamDocxFromXml(title, "", p1, p2, p3, 'base');

    const resultZip = new AdmZip();
    resultZip.addFile('De_Goc_Truoc_Khi_Tron.docx', baseDocxBuffer);

    // 2. Parse the base docx to prepare for shuffling
    const docxZip = new AdmZip(baseDocxBuffer);
    const documentXmlEntry = docxZip.getEntry("word/document.xml");
    if (!documentXmlEntry) {
      throw new Error("Không thể tìm thấy word/document.xml trong đề gốc.");
    }
    const documentXmlText = documentXmlEntry.getData().toString("utf-8");

    const baseDocxEntries: { entryName: string; data: Buffer }[] = [];
    for (const entry of docxZip.getEntries()) {
      if (entry.entryName !== 'word/document.xml' && !entry.isDirectory) {
        baseDocxEntries.push({
          entryName: entry.entryName,
          data: entry.getData()
        });
      }
    }

    const examData = parseExam(documentXmlText, {});
    // Truyền chuỗi XML, không parse sẵn thành DOM — xem giải thích ở exam.shuffle.ts.

    const hasFooterFiles = baseDocxEntries.some(entry =>
      entry.entryName.startsWith('word/footer') && entry.entryName.endsWith('.xml')
    );

    const all_keys: Record<number, any> = {};

    // 3. Shuffle and generate versions
    for (const code of codes) {
      await new Promise(resolve => setImmediate(resolve));

      const { shuffled_parts, key_map } = shuffleExamData(
        examData.parts,
        code,
        null, // part3_code
        shuffle_questions !== false,
        shuffle_choices !== false,
        shuffle_statements !== false
      );
      all_keys[code] = key_map;

      // Student version
      const studentXml = exportShuffledXml(
        shuffled_parts,
        examData.header_elements,
        examData.footer_elements,
        examData.part_headers,
        documentXmlText,
        false,
        String(code),
        hasFooterFiles
      );
      const studentDocxBuffer = buildModifiedDocxZip(baseDocxEntries, studentXml, String(code));
      resultZip.addFile(`De_HocSinh_${code}.docx`, studentDocxBuffer);

      // Teacher version
      const teacherXml = exportShuffledXml(
        shuffled_parts,
        examData.header_elements,
        examData.footer_elements,
        examData.part_headers,
        documentXmlText,
        true,
        String(code),
        hasFooterFiles
      );
      const teacherDocxBuffer = buildModifiedDocxZip(baseDocxEntries, teacherXml, String(code));
      resultZip.addFile(`De_GiaoVien_${code}_CoDapAn.docx`, teacherDocxBuffer);
    }

    // 4. Generate keys and excel
    const keyTableDocBuffer = await generateKeyTableDoc(all_keys);
    resultZip.addFile("Bang_Dap_An_Tong_Hop.docx", keyTableDocBuffer);

    const excelBuffer = exportTnmakerExcel(all_keys);
    resultZip.addFile("Dap_An_TNMaker.xlsx", excelBuffer);

    await generateTnmakerAnswersAndQr(all_keys, resultZip);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="Bo_De_Tron_Tu_Ngan_Hang.zip"');
    res.send(resultZip.toBuffer());
  } catch (error: any) {
    console.error("Error shuffling bank questions:", error);
    res.status(500).json({ error: 'Lỗi trộn đề: ' + error.message });
  }
});

bankRouter.post('/generate-base-docx', attachVerifiedUser, shuffleLimiter, express.json({ limit: BANK_JSON_LIMIT }), async (req, res) => {
  try {
    const { title = 'Đề thi gốc', questions = [] } = req.body;

    if (!Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ error: 'Danh sách câu hỏi chọn rỗng!' });
      return;
    }
    if (questions.length > 500) {
      res.status(400).json({ error: 'Vượt quá giới hạn câu hỏi (tối đa 500 câu).' });
      return;
    }
    for (const q of questions) {
      if (JSON.stringify(q).length > 200000) {
        res.status(400).json({ error: 'Một số câu hỏi có kích thước quá lớn.' });
        return;
      }
    }

    const p1 = questions.filter(q => (q.type || 'choice') === 'choice' || q.type === 'mcq');
    const p2 = questions.filter(q => q.type === 'true_false' || q.type === 'tf' || q.type === 'tf_statement');
    const p3 = questions.filter(q => q.type === 'short_answer' || q.type === 'short' || q.type === 'essay' || q.type === 'fill');

    const baseDocxBuffer = await generateBankExamDocxFromXml(
      title,
      "",
      p1,
      p2,
      p3,
      'base'
    );

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="De_Goc_Luu_Tru.docx"`);
    res.send(baseDocxBuffer);
  } catch (error: any) {
    console.error("Error generating base docx:", error);
    res.status(500).json({ error: "Lỗi tạo file đề gốc: " + error.message });
  }
});
