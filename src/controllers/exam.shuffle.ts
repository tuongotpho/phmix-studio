import { Request, Response } from 'express';
import AdmZip from 'adm-zip';
import QRCode from 'qrcode';
import { getUserRole, userLastCodeStartCache } from '../services/auth.service.js';
import { exportTnmakerExcel, generateKeyTableDoc, buildModifiedDocxZip, generateTnmakerAnswersAndQr } from '../services/export.service.js';
import { parseExam, shuffleExamData, exportShuffledXml } from '../../shuffler.js';
import path from 'path';
import { DEFAULT_PROJECT_ID, DEFAULT_DATABASE_ID } from '../config/env.js';
import { checkArchiveLimits } from '../services/docx-archive.js';
import { MAX_CODES_PER_REQUEST } from '../config/limits.js';
import { buildShuffleNote, SHUFFLE_NOTE_FILENAME } from '../services/shuffle-notes.js';

// POST endpoint for validating exam structure and finding unanswered questions

const activeShuffleLocks = new Set<string>();

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

        if (activeShuffleLocks.has(userKey)) {
            res.status(429).json({ error: 'Hệ thống đang xử lý yêu cầu trộn đề trước đó của bạn. Vui lòng đợi hoàn tất!' });
            return;
        }
        // Chỉ nhận trách nhiệm giải phóng lock SAU khi đã thực sự giành được nó.
        // Trước đây userKeyForLock được gán trước lần kiểm tra ở trên, nên một request
        // bị từ chối 429 sẽ xoá lock của request đang chạy trong khối finally.
        activeShuffleLocks.add(userKey);
        userKeyForLock = userKey;

        if (num_codes > 48) {
            const lastUserCodeStart = userLastCodeStartCache.get(userKey);
            if (lastUserCodeStart !== undefined) {
                if (code_start === lastUserCodeStart) {
                    res.status(400).json({ error: 'Để tránh trùng lặp khi trộn trên 48 mã đề, mã đề bắt đầu không được trùng với lần tạo trước của bạn! Vui lòng đổi sang mã bắt đầu khác.' });
                    return;
                }
                const currentPrefix = String(code_start).charAt(0);
                const lastPrefix = String(lastUserCodeStart).charAt(0);
                if (currentPrefix === lastPrefix) {
                    res.status(400).json({ error: `Để tránh trùng lặp khi trộn trên 48 mã đề, mã đề bắt đầu phải chuyển sang đầu số khác so với lần tạo trước (${lastUserCodeStart})!` });
                    return;
                }
            }
        }
        if (!isProOrAdmin && num_codes > 2) {
            res.status(403).json({ error: 'Tài khoản chưa được kích hoạt bản PRO! Bản dùng thử giới hạn tối đa 2 mã đề.' });
            return;
        }
        if (num_codes > MAX_CODES_PER_REQUEST) {
            res.status(400).json({ error: `Số lượng mã đề trực tuyến tối đa mỗi lần tạo là ${MAX_CODES_PER_REQUEST} để đảm bảo hiệu năng tối ưu.` });
            return;
        }
        // Load the original docx as a zip package to read word/document.xml
        const docxZip = new AdmZip(file.buffer);
        // Trước vòng lặp pre-extract bên dưới: nó gọi getData() cho MỌI entry.
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
        // Pre-extract all entries except word/document.xml to avoid parsing the zip 100+ times in the loop
        const baseDocxEntries = [];
        for (const entry of docxZip.getEntries()) {
            if (entry.entryName !== 'word/document.xml' && !entry.isDirectory) {
                baseDocxEntries.push({
                    entryName: entry.entryName,
                    data: entry.getData()
                });
            }
        }
        const hasFooterFiles = baseDocxEntries.some((entry: any) => entry.entryName.startsWith('word/footer') && entry.entryName.endsWith('.xml'));
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
        // Truyền THẲNG CHUỖI XML cho exportShuffledXml, đừng parse sẵn thành DOM.
        //
        // Trước đây ở đây parse sẵn một lần "to avoid re-parsing raw XML strings in each
        // loop". Suy luận nghe hợp lý nhưng ngược với thực tế: mỗi mã đề vẫn cần một cây
        // DOM sạch riêng, và exportShuffledXml lấy nó bằng cloneNode(true) — mà trong
        // @xmldom/xmldom, deep-clone phải dựng lại từng node bằng JS thuần nên CHẬM HƠN
        // parse lại từ chuỗi 2,3 lần (159ms so với 69ms mỗi lượt, đo trên đề 220KB).
        // Đổi sang truyền chuỗi: nhanh hơn 21% và output giống nhau từng byte
        // (xem tests/export-template.test.ts).
        // Create target output zip
        const resultZip = new AdmZip();
        const codes = [];
        for (let i = 0; i < num_codes; i++) {
            codes.push(code_start + i);
        }
        const all_keys: any = {};
        // Shuffle and append to zip outputs
        for (const code of codes) {
            // Yield to Event Loop to prevent blocking other requests
            await new Promise(resolve => setImmediate(resolve));
            const { shuffled_parts, key_map } = shuffleExamData(examData.parts, code, null, shuffle_questions, shuffle_choices, shuffle_statements);
            all_keys[code] = key_map;
            // Student version
            const studentXml = exportShuffledXml(shuffled_parts, examData.header_elements, examData.footer_elements, examData.part_headers, documentXmlText,false, String(code), hasFooterFiles);
            const studentDocxBuffer = buildModifiedDocxZip(baseDocxEntries, studentXml, String(code));
            resultZip.addFile(`De_HocSinh_${code}.docx`, studentDocxBuffer);
            // Teacher version
            const teacherXml = exportShuffledXml(shuffled_parts, examData.header_elements, examData.footer_elements, examData.part_headers, documentXmlText,true, String(code), hasFooterFiles);
            const teacherDocxBuffer = buildModifiedDocxZip(baseDocxEntries, teacherXml, String(code));
            resultZip.addFile(`De_GiaoVien_${code}_CoDapAn.docx`, teacherDocxBuffer);
        }
        // Answer key tables document
        const keyTableDocBuffer = await generateKeyTableDoc(all_keys);
        resultZip.addFile("Bang_Dap_An_Tong_Hop.docx", keyTableDocBuffer);
        // TNMaker Excel
        const excelBuffer = exportTnmakerExcel(all_keys);
        resultZip.addFile("Dap_An_TNMaker.xlsx", excelBuffer);
        // Generate TNMaker QR codes using the official JSON-based format
        await generateTnmakerAnswersAndQr(all_keys, resultZip);
        // Câu không đọc được cấu trúc thì engine bỏ qua khâu trộn cho riêng nó, im lặng.
        // Endpoint này không trả warnings về client (chỉ /api/validate trả), nên ghi chú
        // phải nằm trong chính tệp zip.
        const shuffleNote = buildShuffleNote(examData);
        if (shuffleNote) {
            resultZip.addFile(SHUFFLE_NOTE_FILENAME, Buffer.from('﻿' + shuffleNote, 'utf-8'));
        }
        // Save successful code start for next validation per user
        userLastCodeStartCache.set(userKey, code_start);
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
            activeShuffleLocks.delete(userKeyForLock);
        }
    }
};
