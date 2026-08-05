import * as XLSX from 'xlsx';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  AlignmentType,
  BorderStyle,
  WidthType
} from 'docx';
import AdmZip from 'adm-zip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { createFooterCodeParagraph } from '../shuffler/index.js';

/**
 * Exports answer keys to XLSX format compatible with TNMaker.
 * Part III answers format decimals with commas (e.g., 3,5 instead of 3.5).
 */
export function exportTnmakerExcel(all_keys: Record<number, any>): Buffer {
  const codes = Object.keys(all_keys).map(Number).sort((a, b) => a - b);
  if (codes.length === 0) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["Câu / Mã đề"]]);
    XLSX.utils.book_append_sheet(wb, ws, "TNMaker Keys");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

  const firstCode = codes[0];
  const part1Count = (all_keys[firstCode][1] || []).length;
  const part2Count = (all_keys[firstCode][2] || []).length;
  const part3Count = (all_keys[firstCode][3] || []).length;

  const headerRow = ["Câu / Mã đề", ...codes.map(c => String(c))];
  const rows: any[][] = [headerRow];

  // Part I rows
  if (part1Count > 0) {
    for (let i = 0; i < part1Count; i++) {
      const rowLabel = i + 1;
      const row: any[] = [rowLabel];
      codes.forEach(code => {
        const ans = all_keys[code][1][i]?.answer || "";
        row.push(ans);
      });
      rows.push(row);
    }
  }

  // Part II rows
  if (part2Count > 0) {
    for (let i = 0; i < part2Count; i++) {
      const rowLabel = part1Count + i + 1;
      const row: any[] = [rowLabel];
      codes.forEach(code => {
        const ansDict = all_keys[code][2][i]?.answer;
        if (!ansDict) {
          row.push("");
        } else {
          const val = ['a', 'b', 'c', 'd']
            .map(letter => ansDict[letter] ? "Đ" : "S")
            .join("");
          row.push(val);
        }
      });
      rows.push(row);
    }
  }

  // Part III rows
  // Replace ALL dots with commas for TNMaker formatting
  if (part3Count > 0) {
    for (let i = 0; i < part3Count; i++) {
      const rowLabel = part1Count + part2Count + i + 1;
      const row: any[] = [rowLabel];
      codes.forEach(code => {
        const rawAns = all_keys[code][3][i]?.answer || "";
        const formattedAns = String(rawAns).trim().replaceAll('.', ',');
        row.push(formattedAns);
      });
      rows.push(row);
    }
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "TNMaker Keys");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * DOCX Key Table document generation helper
 */
export async function generateKeyTableDoc(all_keys: Record<number, any>): Promise<Buffer> {
  const codes = Object.keys(all_keys).map(Number).sort((a, b) => a - b);
  const children: any[] = [
    new Paragraph({
      children: [
        new TextRun({
          text: "BẢNG ĐÁP ÁN CÁC MÃ ĐỀ THI",
          bold: true,
          size: 32,
          font: "Times New Roman"
        })
      ],
      alignment: AlignmentType.CENTER
    })
  ];

  function createCell(text: string, isHeader = false, widthPercent?: number, isWarning = false) {
    return new TableCell({
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text,
              bold: isHeader || isWarning,
              font: "Times New Roman",
              size: 22,
              color: isWarning ? "9C0006" : undefined
            })
          ],
          alignment: AlignmentType.CENTER
        })
      ],
      width: widthPercent ? { size: widthPercent, type: WidthType.PERCENTAGE } : undefined,
      shading: isWarning ? { fill: "FFC7CE" } : undefined,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "000000" }
      }
    });
  }

  if (codes.length > 0) {
    const sampleCode = codes[0];
    const p1Count = (all_keys[sampleCode][1] || []).length;
    const p2Count = (all_keys[sampleCode][2] || []).length;
    const p3Count = (all_keys[sampleCode][3] || []).length;

    codes.forEach(code => {
      const codeKeys = all_keys[code];
      const tableRows: TableRow[] = [];

      // Title for this Code
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `MÃ ĐỀ THI: ${code}`,
              bold: true,
              size: 26,
              font: "Times New Roman"
            })
          ],
          spacing: { before: 300, after: 150 }
        })
      );

      // Part I Table
      if (p1Count > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn",
                bold: true,
                italics: true,
                size: 24,
                font: "Times New Roman"
              })
            ],
            spacing: { before: 150, after: 100 }
          })
        );

        const colsPerRow = 10;
        for (let rowIdx = 0; rowIdx < p1Count; rowIdx += colsPerRow) {
          const headerCells: TableCell[] = [];
          const ansCells: TableCell[] = [];

          for (let colIdx = 0; colIdx < colsPerRow && (rowIdx + colIdx) < p1Count; colIdx++) {
            const qNum = rowIdx + colIdx + 1;
            const qItem = codeKeys[1][rowIdx + colIdx];
            const ans = qItem?.answer || "-";

            headerCells.push(createCell(`Câu ${qNum}`, true, 10));
            ansCells.push(createCell(ans, false, 10));
          }

          tableRows.push(new TableRow({ children: headerCells }));
          tableRows.push(new TableRow({ children: ansCells }));
        }

        // Bảng phải được chèn NGAY SAU tiêu đề "PHẦN I" của chính nó.
        // Trước đây khối này nằm cuối vòng lặp mã đề, tức là sau cả bảng Phần II lẫn
        // Phần III — nên tài liệu in ra có tiêu đề "PHẦN I" trống trơn ở trên, còn bảng
        // đáp án Phần I thì trôi xuống dưới cùng không có tiêu đề. Đề chỉ có Phần I thì
        // không lộ, nên lỗi sống sót lâu; đề đủ ba phần theo chuẩn 2025 thì lộ ngay.
        if (tableRows.length > 0) {
          children.push(
            new Table({
              rows: tableRows,
              width: { size: 100, type: WidthType.PERCENTAGE }
            })
          );
        }
      }

      // Part II Table
      if (p2Count > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "PHẦN II. Câu trắc nghiệm Đúng/Sai",
                bold: true,
                italics: true,
                size: 24,
                font: "Times New Roman"
              })
            ],
            spacing: { before: 200, after: 100 }
          })
        );

        const p2Header = [
          createCell("Câu", true, 15),
          createCell("a)", true, 21),
          createCell("b)", true, 21),
          createCell("c)", true, 21),
          createCell("d)", true, 21)
        ];
        const p2Rows: TableRow[] = [new TableRow({ children: p2Header })];

        for (let i = 0; i < p2Count; i++) {
          const qNum = p1Count + i + 1;
          const qItem = codeKeys[2][i];
          const ansDict = qItem?.answer || {};

          p2Rows.push(
            new TableRow({
              children: [
                createCell(String(qNum), true, 15),
                createCell(ansDict['a'] ? "Đ" : "S", false, 21),
                createCell(ansDict['b'] ? "Đ" : "S", false, 21),
                createCell(ansDict['c'] ? "Đ" : "S", false, 21),
                createCell(ansDict['d'] ? "Đ" : "S", false, 21)
              ]
            })
          );
        }

        children.push(
          new Table({
            rows: p2Rows,
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
      }

      // Part III Table
      if (p3Count > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "PHẦN III. Câu trắc nghiệm trả lời ngắn",
                bold: true,
                italics: true,
                size: 24,
                font: "Times New Roman"
              })
            ],
            spacing: { before: 200, after: 100 }
          })
        );

        const p3Header = [createCell("Câu", true, 30), createCell("Đáp án", true, 70)];
        const p3Rows: TableRow[] = [new TableRow({ children: p3Header })];

        for (let i = 0; i < p3Count; i++) {
          const qNum = p1Count + p2Count + i + 1;
          const qItem = codeKeys[3][i];
          const rawAns = qItem?.answer;
          const formattedAns = rawAns !== undefined && rawAns !== null ? String(rawAns).trim().replaceAll('.', ',') : "-";

          p3Rows.push(
            new TableRow({
              children: [
                createCell(String(qNum), true, 30),
                createCell(formattedAns, false, 70)
              ]
            })
          );
        }

        children.push(
          new Table({
            rows: p3Rows,
            width: { size: 100, type: WidthType.PERCENTAGE }
          })
        );
      }

    });
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children
      }
    ]
  });

  return await Packer.toBuffer(doc);
}

/**
 * Nén sẵn phần TĨNH của gói .docx — mọi thứ trừ word/document.xml và word/footer1.xml,
 * là hai phần duy nhất thay đổi theo mã đề.
 *
 * Vì sao tách riêng: trước đây buildModifiedDocxZip nhận thẳng danh sách entry đã giải
 * nén và gọi addFile() cho từng cái ở MỖI mã đề, nên adm-zip nén lại toàn bộ ảnh cho
 * từng bản — 24 mã đề × 2 bản (học sinh/giáo viên) = 48 lần nén cùng một bộ ảnh không
 * hề đổi.
 *
 * Đo trên gui/demau_1.docx (8 mã đề, tức 16 lần đóng gói):
 *   không có ảnh (190KB) : đóng gói chiếm  7% tổng thời gian
 *   thêm 8MB ảnh         : đóng gói chiếm 52% tổng thời gian — gấp đôi thời gian chờ
 *
 * Nén một lần rồi dựng lại AdmZip từ buffer đó: adm-zip giữ nguyên dữ liệu đã nén của
 * các entry không bị chạm tới, nên mỗi mã đề chỉ còn phải nén hai tệp XML nhỏ.
 */
export function prepareDocxTemplate(baseDocxEntries: { entryName: string; data: Buffer }[]): Buffer {
  const docxZip = new AdmZip();

  // 1. Modify word/_rels/document.xml.rels
  let modifiedRelsData: Buffer | null = null;
  const relsEntry = baseDocxEntries.find(e => e.entryName === 'word/_rels/document.xml.rels');
  if (relsEntry) {
    try {
      const relsDoc = new DOMParser().parseFromString(relsEntry.data.toString('utf-8'), 'text/xml');
      const relationshipsEl = relsDoc.getElementsByTagName('Relationships')[0] || relsDoc.documentElement;
      let footerRelExists = false;
      const rels = relsDoc.getElementsByTagName('Relationship');
      for (let i = 0; i < rels.length; i++) {
        if (rels[i].getAttribute('Id') === 'rIdFooter99') {
          footerRelExists = true;
          break;
        }
      }
      if (!footerRelExists) {
        const newRel = relsDoc.createElement('Relationship');
        newRel.setAttribute('Id', 'rIdFooter99');
        newRel.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer');
        newRel.setAttribute('Target', 'footer1.xml');
        relationshipsEl.appendChild(newRel);
      }
      modifiedRelsData = Buffer.from(new XMLSerializer().serializeToString(relsDoc), 'utf-8');
    } catch (err) {
      console.error("Error creating rels:", err);
    }
  }

  // 2. Modify [Content_Types].xml
  let modifiedContentTypesData: Buffer | null = null;
  const ctEntry = baseDocxEntries.find(e => e.entryName === '[Content_Types].xml');
  if (ctEntry) {
    try {
      const ctDoc = new DOMParser().parseFromString(ctEntry.data.toString('utf-8'), 'text/xml');
      const typesEl = ctDoc.getElementsByTagName('Types')[0] || ctDoc.documentElement;
      let footerOverrideExists = false;
      const overrides = ctDoc.getElementsByTagName('Override');
      for (let i = 0; i < overrides.length; i++) {
        if (overrides[i].getAttribute('PartName') === '/word/footer1.xml') {
          footerOverrideExists = true;
          break;
        }
      }
      if (!footerOverrideExists) {
        const newOverride = ctDoc.createElement('Override');
        newOverride.setAttribute('PartName', '/word/footer1.xml');
        newOverride.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml');
        typesEl.appendChild(newOverride);
      }
      modifiedContentTypesData = Buffer.from(new XMLSerializer().serializeToString(ctDoc), 'utf-8');
    } catch (err) {
      console.error("Error creating content types:", err);
    }
  }

  // 3. Add entries to the zip, ignoring pre-existing footer xml files
  for (const entryObj of baseDocxEntries) {
    if (entryObj.entryName.startsWith('word/footer') && entryObj.entryName.endsWith('.xml')) {
      continue;
    }
    
    if (entryObj.entryName === 'word/_rels/document.xml.rels' && modifiedRelsData) {
      docxZip.addFile(entryObj.entryName, modifiedRelsData);
    } else if (entryObj.entryName === '[Content_Types].xml' && modifiedContentTypesData) {
      docxZip.addFile(entryObj.entryName, modifiedContentTypesData);
    } else {
      docxZip.addFile(entryObj.entryName, entryObj.data);
    }
  }

  // Nén tại đây một lần duy nhất. word/document.xml và word/footer1.xml được thêm sau,
  // theo từng mã đề, trong buildModifiedDocxZip().
  return docxZip.toBuffer();
}

/**
 * Gắn word/document.xml đã trộn và word/footer1.xml mang mã đề vào gói mẫu.
 *
 * `docxTemplate` là kết quả của prepareDocxTemplate() — gọi MỘT LẦN cho cả bộ đề rồi
 * truyền lại vào đây cho từng mã. adm-zip giữ nguyên dữ liệu đã nén của những entry
 * không bị chạm tới, nên ảnh không bị nén lại.
 */
export function buildModifiedDocxZip(
  docxTemplate: Buffer,
  documentXml: string,
  code: string
): Buffer {
  const docxZip = new AdmZip(docxTemplate);

  // Synthesize word/footer1.xml
  try {
    const footerDoc = new DOMParser().parseFromString(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"></w:ftr>`,
      'text/xml'
    );
    const ftrEl = footerDoc.getElementsByTagName('w:ftr')[0] || footerDoc.documentElement;
    const p = createFooterCodeParagraph(footerDoc, code);
    ftrEl.appendChild(p);
    const footerXmlText = new XMLSerializer().serializeToString(footerDoc);
    docxZip.addFile('word/footer1.xml', Buffer.from(footerXmlText, 'utf-8'));
  } catch (err) {
    console.error("Error synthesizing word/footer1.xml:", err);
  }

  // Add the modified word/document.xml
  docxZip.addFile("word/document.xml", Buffer.from(documentXml, "utf-8"));

  return docxZip.toBuffer();
}

import QRCode from 'qrcode';
export async function generateTnmakerAnswersAndQr(all_keys: Record<number, Record<number, any[]>>, resultZip: any) {
  const tnmakerAnswers: Record<string, string> = {};
  const codes = Object.keys(all_keys).map(Number);
  
  for (const code of codes) {
    const part1Answers = all_keys[code][1] || [];
    const part2Answers = all_keys[code][2] || [];
    const part3Answers = all_keys[code][3] || [];

    const part1List: string[] = [];
    part1Answers.forEach((q: any) => { part1List.push(q.answer || ""); });
    const part1Str = part1List.join("");

    const part2List: string[] = [];
    part2Answers.forEach((q: any) => {
      const ansDict = q.answer;
      if (!ansDict) part2List.push("");
      else part2List.push(['a', 'b', 'c', 'd'].map(letter => ansDict[letter] ? "Đ" : "S").join(""));
    });
    const part2Str = part2List.join("_");

    const part3List: string[] = [];
    part3Answers.forEach((q: any) => {
      const formattedAns = String(q.answer || "").trim().replaceAll(',', '.');
      part3List.push(formattedAns);
    });
    const part3Str = part3List.join("_");

    tnmakerAnswers[String(code)] = [part1Str, part2Str, part3Str].join("#");
  }

  if (codes.length > 0) {
    const mergedPayload: Record<string, any> = {};
    for (const code of codes) {
      mergedPayload[String(code)] = tnmakerAnswers[String(code)];
    }
    mergedPayload.success = true;
    mergedPayload.type = 5;

    const mergedQrString = JSON.stringify(mergedPayload);
    try {
      const mergedQrBuffer = await QRCode.toBuffer(mergedQrString, { type: 'png', width: 500, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
      resultZip.addFile("MaQR_ChamDiem_TNMaker.png", mergedQrBuffer);
    } catch (qrErr) {
      // KHÔNG nuốt lỗi. Trước đây ở đây chỉ có console.error, nên khi chuỗi đáp án
      // vượt sức chứa QR (2953 byte) thì tệp zip vẫn tải về bình thường mà thiếu hẳn
      // MaQR_ChamDiem_TNMaker.png — giáo viên chỉ phát hiện lúc chấm bài, không có
      // lấy một dòng cảnh báo. Mất tính năng âm thầm còn tệ hơn báo lỗi thẳng.
      //
      // Zip là tệp nhị phân nên không chèn được thông báo vào phần thân HTTP; đặt
      // ghi chú NGAY TRONG tệp zip là chỗ chắc chắn người dùng nhìn thấy.
      console.error("Error generating TNMaker QR code:", qrErr);

      const note = [
        'KHÔNG TẠO ĐƯỢC MÃ QR CHẤM ĐIỂM TNMAKER',
        '',
        `Lý do: ${(qrErr as any)?.message || qrErr}`,
        `Số mã đề trong lần tạo này: ${codes.length}`,
        `Độ dài chuỗi đáp án: ${mergedQrString.length} ký tự (mã QR chứa tối đa khoảng 2953 ký tự).`,
        '',
        'Bộ đề và các tệp đáp án khác trong thư mục này VẪN DÙNG ĐƯỢC bình thường.',
        'Chỉ riêng tệp MaQR_ChamDiem_TNMaker.png bị thiếu.',
        '',
        'Cách xử lý: giảm số mã đề mỗi lần tạo, hoặc rút ngắn nội dung đáp án ở',
        'Phần III (trả lời ngắn) — đáp án càng dài thì chuỗi QR càng phình to.'
      ].join('\n');
      resultZip.addFile('LUU_Y_THIEU_MA_QR.txt', Buffer.from('﻿' + note, 'utf-8'));
    }
  }
}
