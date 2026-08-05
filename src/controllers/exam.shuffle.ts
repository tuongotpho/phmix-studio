import { Request, Response } from 'express';
import AdmZip from 'adm-zip';
import path from 'path';
import { getUserRole } from '../services/auth.service.js';
import { parseExam, examHasQuestions } from '../shuffler/index.js';
import { DEFAULT_PROJECT_ID, DEFAULT_DATABASE_ID } from '../config/env.js';
import { checkArchiveLimits } from '../services/docx-archive.js';
import { MAX_CODES_PER_REQUEST } from '../config/limits.js';
import { buildShuffledExamZip, extractBaseDocxEntries } from '../services/shuffle-pipeline.js';
import { acquireShuffleLock, releaseShuffleLock } from '../services/shuffle-lock.js';

export const shuffleExam = async (req: Request, res: Response) => {
    let userKeyForLock: string | null = null;
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Không tìm thấy tệp tin được tải lên!' });
            return;
        }
        const file = req.file;
        const num_codes = parseInt(req.body.num_codes || '4', 10);
        const code_start = parseInt(req.body.code_start || '101', 10);
        const shuffle_questions = req.body.shuffle_questions !== 'off';
        const shuffle_choices = req.body.shuffle_choices !== 'off';
        const shuffle_statements = req.body.shuffle_statements !== 'off';
        // Tuỳ chọn: điền lại mã tái tạo lấy từ THONG_TIN_BO_DE.txt của lần trộn trước để
        // dựng đúng bộ đề cũ. Bỏ trống thì mỗi lần trộn ra một bộ khác (mặc định).
        const rawSeed = String(req.body.seed ?? '').trim();
        let seed: number | undefined;
        if (rawSeed) {
            const parsed = Number(rawSeed);
            if (!Number.isInteger(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) {
                res.status(400).json({ error: 'Mã tái tạo không hợp lệ: phải là số nguyên không âm.' });
                return;
            }
            seed = parsed;
        }
        if (isNaN(num_codes) || num_codes <= 0) {
            res.status(400).json({ error: 'Số lượng mã đề cần tạo phải là số nguyên dương lớn hơn 0!' });
            return;
        }
        if (isNaN(code_start) || code_start <= 0) {
            res.status(400).json({ error: 'Mã đề bắt đầu phải là số nguyên dương lớn hơn 0!' });
            return;
        }
        // Danh tính đã được attachVerifiedUser xác thực bằng chữ ký JWT (không tin header).
        const verifiedUid = req.auth?.uid;
        const idToken = req.auth?.token;

        const role = await getUserRole(verifiedUid, idToken, DEFAULT_PROJECT_ID, DEFAULT_DATABASE_ID);
        const isProOrAdmin = role === 'pro' || role === 'admin';
        const userKey = verifiedUid || (req.ip as string) || 'anonymous';

        // Kiểm tra hạn mức TRƯỚC khi giành khoá: các phép kiểm tra này rẻ, và một yêu
        // cầu không hợp lệ thì không có lý do gì chiếm khoá của người dùng.
        //
        // Trần MAX_CODES_PER_REQUEST phải đứng trước mọi quy tắc khác về số mã đề. Trước
        // đây ở đây còn một nhánh riêng cho `num_codes > 48` (buộc đổi đầu số so với lần
        // trước) chạy TRƯỚC trần này — mà trần là 24, nên nhánh đó không bao giờ dẫn tới
        // một lần trộn thành công. Hậu quả duy nhất của nó: người nhập 50 nhận được thông
        // báo "phải chuyển sang đầu số khác" thay vì "tối đa 24 mã đề". Đã bỏ hẳn.
        if (!isProOrAdmin && num_codes > 2) {
            res.status(403).json({ error: 'Tài khoản chưa được kích hoạt bản PRO! Bản dùng thử giới hạn tối đa 2 mã đề.' });
            return;
        }
        if (num_codes > MAX_CODES_PER_REQUEST) {
            res.status(400).json({ error: `Số lượng mã đề trực tuyến tối đa mỗi lần tạo là ${MAX_CODES_PER_REQUEST} để đảm bảo hiệu năng tối ưu.` });
            return;
        }

        // Khoá nằm trên Firestore nên có hiệu lực trên toàn bộ instance — xem
        // src/services/shuffle-lock.ts.
        if (!(await acquireShuffleLock(userKey))) {
            res.status(429).json({ error: 'Hệ thống đang xử lý yêu cầu trộn đề trước đó của bạn. Vui lòng đợi hoàn tất!' });
            return;
        }
        // Chỉ nhận trách nhiệm giải phóng lock SAU khi đã thực sự giành được nó.
        // Trước đây userKeyForLock được gán trước lần kiểm tra ở trên, nên một request
        // bị từ chối 429 sẽ xoá lock của request đang chạy trong khối finally.
        userKeyForLock = userKey;
        // Load the original docx as a zip package to read word/document.xml
        const docxZip = new AdmZip(file.buffer);
        // Trước khi bóc entry bên dưới: extractBaseDocxEntries() gọi getData() cho MỌI entry.
        const tooLarge = checkArchiveLimits(docxZip);
        if (tooLarge) {
            res.status(400).json({ error: tooLarge });
            return;
        }
        const documentXmlEntry = docxZip.getEntry("word/document.xml");
        if (!documentXmlEntry) {
            res.status(400).json({ error: 'Tệp docx không đúng cấu trúc (không tìm thấy word/document.xml).' });
            return;
        }
        const documentXmlText = documentXmlEntry.getData().toString("utf-8");
        const baseDocxEntries = extractBaseDocxEntries(docxZip);

        const answer_overrides_str = req.body.answer_overrides || '{}';
        let overrides: any = {};
        try {
            overrides = JSON.parse(answer_overrides_str);
            if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) {
                throw new Error("Overrides must be a JSON object");
            }
        }
        catch (e) {
            console.error("Error parsing answer overrides:", e);
            res.status(400).json({ error: 'Cấu trúc answer_overrides không hợp lệ (JSON lỗi).' });
            return;
        }
        // Parse elements with optional overrides
        const examData = parseExam(documentXmlText, overrides);

        // Đề rỗng thì DỪNG. Trộn tiếp sẽ cho ra bộ zip đầy đủ tên tệp nhưng mọi đề bên
        // trong đều là bản gốc chưa trộn — im lặng và chỉ lộ ra lúc phát đề.
        if (!examHasQuestions(examData)) {
            res.status(400).json({
                error: 'Không nhận ra câu hỏi nào trong tệp đề. Bộ đề chưa được tạo.',
                warnings: examData.warnings
            });
            return;
        }

        const codes = [];
        for (let i = 0; i < num_codes; i++) {
            codes.push(code_start + i);
        }

        const resultZip = await buildShuffledExamZip({
            examData,
            documentXmlText,
            baseDocxEntries,
            codes,
            flags: {
                shuffleQuestions: shuffle_questions,
                shuffleChoices: shuffle_choices,
                shuffleStatements: shuffle_statements
            },
            seed
        });

        // Write zip
        const zipBuffer = resultZip.toBuffer();
        const safeOriginalName = path.basename(file.originalname as string, '.docx').replace(/[^a-zA-Z0-9_\-\u00C0-\u1EF9]/g, '_');
        const downloadName = `TronDe_${safeOriginalName}_ketqua.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
        res.send(zipBuffer);
    }
    catch (error: any) {
        console.error("System error in api_shuffle:", error);
        res.status(500).json({ error: `Lỗi hệ thống: ${error.message}` });
    }
    finally {
        if (userKeyForLock) {
            await releaseShuffleLock(userKeyForLock);
        }
    }
};
