import { Request, Response } from 'express';
import AdmZip from 'adm-zip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { parseExam, getNodeTextWithMediaAndMath, getElementsByTagNameLocal } from '../../shuffler.js';

// POST endpoint for validating exam structure and finding unanswered questions

export const parseDocx = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Không tìm thấy tệp tin được tải lên!' });
            return;
        }
        const file = req.file;
        const docxZip = new AdmZip(file.buffer);
        const documentXmlEntry = docxZip.getEntry("word/document.xml");
        if (!documentXmlEntry) {
            res.status(400).json({ error: 'Tệp docx không đúng cấu trúc (không tìm thấy word/document.xml).' });
            return;
        }
        const documentXmlText = documentXmlEntry.getData().toString("utf-8");
        const examData = parseExam(documentXmlText, {});
        // Parse relationship entry and media files for images & formulas
        const relsMap: Record<string, string> = {};
        const relsEntry = docxZip.getEntry("word/_rels/document.xml.rels") || docxZip.getEntry("word/document.xml.rels");
        if (relsEntry) {
            try {
                const relsXml = relsEntry.getData().toString("utf-8");
                const relsDoc = new DOMParser().parseFromString(relsXml, 'text/xml');
                const relElms = relsDoc.getElementsByTagName("Relationship");
                for (let i = 0; i < relElms.length; i++) {
                    const rel = relElms.item(i);
                    if (rel) {
                        const id = rel.getAttribute("Id");
                        const target = rel.getAttribute("Target");
                        if (id && target) {
                            const cleanTarget = target.replace(/^\.\//, '').replace(/^\//, '');
                            const fullPath = cleanTarget.startsWith("word/") ? cleanTarget : ("word/" + cleanTarget);
                            relsMap[id] = fullPath;
                        }
                    }
                }
            }
            catch (relsErr) {
                console.warn("Failed to parse docx rels:", relsErr);
            }
        }
        const mediaMap: Record<string, string> = {};
        for (const entry of docxZip.getEntries()) {
            if (entry.entryName.startsWith("word/media/") || entry.entryName.startsWith("word/embeddings/")) {
                const ext = entry.entryName.split('.').pop()?.toLowerCase() || 'png';
                const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : ext === 'bin' ? 'application/octet-stream' : 'image/png';
                const base64 = entry.getData().toString('base64');
                mediaMap[entry.entryName] = `data:${mimeType};base64,${base64}`;
            }
        }
        const parsedQuestions: any[] = [];
        function stripQuestionNumberFromElement(el: any) {
            let found = false;
            const stripQ = (node: any) => {
                if (!node || !node.childNodes)
                    return;
                if (node.nodeType === 3) {
                    const val = node.nodeValue || '';
                    if (!found && val.trim().length > 0) {
                        const match = val.match(/^\s*(Câu|Cau)\s*\d+([\.\:\s]+)/i);
                        if (match) {
                            node.nodeValue = val.replace(/^\s*(Câu|Cau)\s*\d+([\.\:\s]+)/i, '');
                        }
                        found = true;
                    }
                }
                Array.from(node.childNodes).forEach(stripQ);
            };
            stripQ(el);
        }
        const xmlSerializer = new XMLSerializer();
        function extractMediaItems(elements: any[]) {
            const ids = new Set();
            const traverse = (node: any) => {
                if (!node || !node.childNodes)
                    return;
                const tag = (node.localName || node.tagName || '').split(':').pop() || '';
                if (tag === 'drawing' || tag === 'shape' || tag === 'pict' || tag === 'object') {
                    const blips = getElementsByTagNameLocal(node, 'blip');
                    if (blips.length > 0)
                        ids.add(blips[0].getAttribute('r:embed') || blips[0].getAttribute('embed') || '');
                    const imageDatas = getElementsByTagNameLocal(node, 'imagedata');
                    if (imageDatas.length > 0)
                        ids.add(imageDatas[0].getAttribute('r:id') || imageDatas[0].getAttribute('id') || '');
                    const oleObjects = getElementsByTagNameLocal(node, 'OLEObject');
                    if (oleObjects.length > 0)
                        ids.add(oleObjects[0].getAttribute('r:id') || oleObjects[0].getAttribute('id') || '');
                }
                const children = Array.from(node.childNodes || []);
                for (const child of children)
                    traverse(child);
            };
            elements.forEach(traverse);
            const items: any[] = [];
            ids.forEach(id => {
                if (id && typeof id === "string" && relsMap[id]) {
                    const target = relsMap[id as string];
                    if (target && typeof target === "string" && mediaMap[target]) {
                        items.push({ id, target, base64: mediaMap[target as string] });
                    }
                }
            });
            return items;
        }
        // Extract Part 1 (Multiple choice)
        if (examData.parts[1]) {
            examData.parts[1].forEach((q, idx) => {
                if (q.elements[0])
                    stripQuestionNumberFromElement(q.elements[0]);
                const rawXmls = q.elements.map((el: any) => xmlSerializer.serializeToString(el));
                const mediaItems = extractMediaItems(q.elements);
                const questionText = q.elements.map((el: any) => getNodeTextWithMediaAndMath(el, relsMap, mediaMap)).join('\n').trim();
                const options: any[] = [];
                let correctAnswer = q.choices_info?.correct_answer || null;
                if (q.choices_info?.options) {
                    ['A', 'B', 'C', 'D'].forEach(char => {
                        const opt = q.choices_info.options[char];
                        let txt = '';
                        if (Array.isArray(opt)) {
                            txt = opt.map((n) => getNodeTextWithMediaAndMath(n, relsMap, mediaMap)).join('').trim();
                        }
                        else if (opt) {
                            txt = getNodeTextWithMediaAndMath(opt, relsMap, mediaMap).trim();
                        }
                        if (txt) {
                            options.push({ id: char, content: txt, letter: char, text: txt });
                        }
                    });
                }
                parsedQuestions.push({
                    id: `q_p1_${q.number}_${idx}`,
                    number: q.number,
                    part: 1,
                    partName: 'Phần I - Trắc nghiệm',
                    type: 'choice',
                    questionText,
                    options,
                    correctAnswer,
                    rawXmls,
                    mediaItems,
                    classification: {
                        subject: 'Chưa phân loại',
                        grade: 'Chưa phân loại',
                        bookSeries: 'Chưa phân loại',
                        chapter: 'Chưa phân loại',
                        lesson: 'Chưa phân loại',
                        difficulty: 'Chưa phân loại'
                    },
                    isPublic: false
                });
            });
        }
        // Extract Part 2 (True/False)
        if (examData.parts[2]) {
            examData.parts[2].forEach((q, idx) => {
                if (q.elements[0])
                    stripQuestionNumberFromElement(q.elements[0]);
                const rawXmls = q.elements.map((el: any) => xmlSerializer.serializeToString(el));
                const mediaItems = extractMediaItems(q.elements);
                const questionText = q.elements.map((el: any) => getNodeTextWithMediaAndMath(el, relsMap, mediaMap)).join('\n').trim();
                const statements: any[] = [];
                const correctAnswers = q.statements_info?.correct_answers || {};
                if (q.statements_info?.statements) {
                    ['a', 'b', 'c', 'd'].forEach(char => {
                        const el = q.statements_info.statements[char];
                        if (el) {
                            const txt = getNodeTextWithMediaAndMath(el, relsMap, mediaMap).trim();
                            statements.push({
                                id: char,
                                label: char,
                                content: txt,
                                text: txt,
                                isTrue: !!correctAnswers[char],
                                isCorrect: !!correctAnswers[char]
                            });
                        }
                    });
                }
                parsedQuestions.push({
                    id: `q_p2_${q.number}_${idx}`,
                    number: q.number,
                    part: 2,
                    partName: 'Phần II - Đúng / Sai',
                    type: 'true_false',
                    questionText,
                    statements,
                    correctAnswers,
                    rawXmls,
                    mediaItems,
                    classification: {
                        subject: 'Chưa phân loại',
                        grade: 'Chưa phân loại',
                        bookSeries: 'Chưa phân loại',
                        chapter: 'Chưa phân loại',
                        lesson: 'Chưa phân loại',
                        difficulty: 'Chưa phân loại'
                    },
                    isPublic: false
                });
            });
        }
        // Extract Part 3 (Short answer)
        if (examData.parts[3]) {
            examData.parts[3].forEach((q, idx) => {
                if (q.elements[0])
                    stripQuestionNumberFromElement(q.elements[0]);
                const rawXmls = q.elements.map((el: any) => xmlSerializer.serializeToString(el));
                const mediaItems = extractMediaItems(q.elements);
                const questionText = q.elements.map((el: any) => getNodeTextWithMediaAndMath(el, relsMap, mediaMap)).join('\n').trim();
                const val = q.short_answer_info?.answer_value || '';
                parsedQuestions.push({
                    id: `q_p3_${q.number}_${idx}`,
                    number: q.number,
                    part: 3,
                    partName: 'Phần III - Trả lời ngắn',
                    type: 'short_answer',
                    questionText,
                    correctAnswer: val,
                    rawXmls,
                    mediaItems,
                    classification: {
                        subject: 'Chưa phân loại',
                        grade: 'Chưa phân loại',
                        bookSeries: 'Chưa phân loại',
                        chapter: 'Chưa phân loại',
                        lesson: 'Chưa phân loại',
                        difficulty: 'Chưa phân loại'
                    },
                    isPublic: false
                });
            });
        }
        res.json({
            success: true,
            filename: file.originalname as string,
            totalQuestions: parsedQuestions.length,
            questions: parsedQuestions,
            warnings: examData.warnings || []
        });
    }
    catch (err: any) {
        console.error("Error parsing DOCX:", err);
        res.status(500).json({ error: `Lỗi phân tích tệp DOCX: ${err.message}` });
    }
};
