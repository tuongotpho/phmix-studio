import { Request, Response } from 'express';
import AdmZip from 'adm-zip';
import { parseExam, getNodeText } from '../../shuffler.js';

// POST endpoint for validating exam structure and finding unanswered questions

export const validateExam = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Không tìm thấy tệp tin được tải lên!' });
            return;
        }
        const file = req.file;
        // Load the original docx as a zip package to read word/document.xml
        const docxZip = new AdmZip(file.buffer);
        const documentXmlEntry = docxZip.getEntry("word/document.xml");
        if (!documentXmlEntry) {
            res.status(400).json({ error: 'Tệp docx không đúng cấu trúc (không tìm thấy word/document.xml).' });
            return;
        }
        const documentXmlText = documentXmlEntry.getData().toString("utf-8");
        const examData = parseExam(documentXmlText, {});
        // Build list of unanswered/invalid questions
        const unansweredQuestions: any[] = [];
        // Part I (Trắc nghiệm)
        if (examData.parts[1]) {
            examData.parts[1].forEach((q: any) => {
                const questionText = q.elements.map((el: any) => getNodeText(el)).join('\n').trim();
                if (!q.choices_info) {
                    unansweredQuestions.push({
                        number: q.number,
                        part: 1,
                        type: 'choice',
                        reason: 'Không tìm thấy hoặc sai định dạng 4 lựa chọn A, B, C, D.',
                        questionText,
                        choices: []
                    });
                }
                else if (q.choices_info.correct_answer === null) {
                    const choices: any[] = [];
                    if (q.choices_info.options) {
                        ['A', 'B', 'C', 'D'].forEach(char => {
                            const opt = q.choices_info.options[char];
                            if (Array.isArray(opt)) {
                                choices.push(`${char}. ${opt.map((n) => getNodeText(n)).join('').trim()}`);
                            }
                            else if (opt) {
                                choices.push(`${char}. ${getNodeText(opt).trim()}`);
                            }
                        });
                    }
                    unansweredQuestions.push({
                        number: q.number,
                        part: 1,
                        type: 'choice',
                        reason: 'Chưa gạch chân chữ cái đầu của đáp án đúng (ví dụ: <u>A</u>. hoặc <u>B</u>.).',
                        questionText,
                        choices
                    });
                }
            });
        }
        // Part II (Đúng sai)
        if (examData.parts[2]) {
            examData.parts[2].forEach((q: any) => {
                const questionText = q.elements.map((el: any) => getNodeText(el)).join('\n').trim();
                if (!q.statements_info) {
                    unansweredQuestions.push({
                        number: q.number,
                        part: 2,
                        type: 'true_false',
                        reason: 'Chưa đúng định dạng 4 mệnh đề a), b), c), d).',
                        questionText,
                        statements: []
                    });
                }
                else {
                    // Check if all are false (none are underlined as True)
                    const correctAnswers = q.statements_info.correct_answers || {};
                    const hasTrue = Object.values(correctAnswers).some(val => val === true);
                    if (!hasTrue) {
                        const statements: any[] = [];
                        if (q.statements_info.statements) {
                            ['a', 'b', 'c', 'd'].forEach(char => {
                                const el = q.statements_info.statements[char];
                                if (el) {
                                    statements.push(`${char}) ${getNodeText(el).trim()}`);
                                }
                            });
                        }
                        unansweredQuestions.push({
                            number: q.number,
                            part: 2,
                            type: 'true_false',
                            reason: 'Chưa gạch chân mệnh đề Đúng nào (ví dụ gạch chân <u>a</u>) hoặc <u>b</u>) để chọn mệnh đề đó là Đúng, mặc định tất cả đang là Sai).',
                            questionText,
                            statements
                        });
                    }
                }
            });
        }
        // Part III (Ngắn - Kết quả tính toán)
        if (examData.parts[3]) {
            examData.parts[3].forEach((q: any) => {
                const questionText = q.elements.map((el: any) => getNodeText(el)).join('\n').trim();
                if (!q.short_answer_info || q.short_answer_info.answer_index === null || q.short_answer_info.answer_value === "") {
                    unansweredQuestions.push({
                        number: q.number,
                        part: 3,
                        type: 'short_answer',
                        reason: 'Thiếu dòng khai báo đáp án đúng định dạng (ví dụ: "Đáp án: 12" hoặc "Đáp số: 3,5").',
                        questionText
                    });
                }
            });
        }
        res.json({
            success: true,
            warnings: examData.warnings || [],
            unanswered: unansweredQuestions
        });
    }
    catch (err: any) {
        console.error("Error in validate exam:", err);
        res.status(500).json({ error: `Lỗi phân tích đề thi: ${err.message}` });
    }
};
