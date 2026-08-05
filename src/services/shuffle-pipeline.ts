import AdmZip from 'adm-zip';
import type { ExamData } from '../shuffler/types.js';
import { shuffleExamData, exportShuffledXml } from '../shuffler/index.js';
import {
  exportTnmakerExcel,
  generateKeyTableDoc,
  buildModifiedDocxZip,
  prepareDocxTemplate,
  generateTnmakerAnswersAndQr
} from './export.service.js';
import { buildShuffleNote, SHUFFLE_NOTE_FILENAME } from './shuffle-notes.js';

/**
 * Khâu trộn đề dùng chung cho CẢ HAI đường vào: tải tệp .docx lên (/api/shuffle) và
 * lắp ráp từ ngân hàng câu hỏi (/api/shuffle-bank).
 *
 * Trước đây mỗi đường có một bản sao gần như y hệt của vòng lặp này — cùng gọi
 * shuffleExamData → exportShuffledXml → buildModifiedDocxZip cho bản học sinh và bản
 * giáo viên, cùng đóng gói bảng đáp án, Excel, mã QR và tệp ghi chú. Hai bản sao nghĩa
 * là mọi bản vá phải áp hai lần, và lần nào quên một bên thì hai đường trả kết quả
 * khác nhau mà không ai phát hiện. Gom về đây để chỉ còn một chỗ phải sửa.
 *
 * Điểm khác biệt thật sự giữa hai đường vào nằm ở khâu CHUẨN BỊ (một bên nhận tệp từ
 * người dùng và có answer_overrides, bên kia tự dựng đề gốc từ ngân hàng), nên phần đó
 * vẫn nằm lại ở controller/route.
 */

export interface DocxEntry {
  entryName: string;
  data: Buffer;
}

export interface ShuffleFlags {
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  shuffleStatements: boolean;
}

export interface ShufflePipelineInput {
  /** Kết quả parseExam() của đề gốc. */
  examData: ExamData;
  /**
   * XML gốc dạng CHUỖI, không phải DOM.
   *
   * Đừng "tối ưu" bằng cách parse sẵn một lần rồi truyền cây DOM vào: mỗi mã đề vẫn
   * cần một cây sạch riêng, và exportShuffledXml lấy nó bằng cloneNode(true) — mà trong
   * @xmldom/xmldom, deep-clone phải dựng lại từng node bằng JS thuần nên CHẬM HƠN parse
   * lại từ chuỗi 2–3 lần (159ms so với 69ms mỗi lượt, đo trên đề 220KB). Truyền chuỗi
   * nhanh hơn 21% và output giống nhau từng byte (xem tests/export-template.test.ts).
   */
  documentXmlText: string;
  /** Mọi entry của đề gốc trừ word/document.xml — xem extractBaseDocxEntries(). */
  baseDocxEntries: DocxEntry[];
  codes: number[];
  flags: ShuffleFlags;
  /**
   * Số nền quyết định kết quả trộn. Bỏ trống thì tự bốc ngẫu nhiên MỘT lần cho cả bộ đề
   * và ghi lại vào tệp THONG_TIN_BO_DE.txt trong zip, để sau này nhập lại là dựng đúng
   * bộ đề cũ. Đưa lại đúng số đó (cùng tệp gốc, cùng mã bắt đầu, cùng tuỳ chọn trộn) sẽ
   * cho kết quả trùng khớp từng mã đề.
   */
  seed?: number;
  /**
   * Zip kết quả để ghi vào. Truyền sẵn khi cần đặt trước tệp nào đó (đường ngân hàng
   * kèm theo bản "đề gốc trước khi trộn"); bỏ trống thì tạo zip mới.
   */
  resultZip?: AdmZip;
}

/**
 * Bóc sẵn mọi entry trừ word/document.xml.
 *
 * Phải làm MỘT LẦN trước vòng lặp: nếu để trong vòng lặp thì gói zip bị giải nén lại
 * cho từng mã đề (24 lần với trần hiện tại).
 */
export function extractBaseDocxEntries(docxZip: AdmZip): DocxEntry[] {
  const entries: DocxEntry[] = [];
  for (const entry of docxZip.getEntries()) {
    if (entry.entryName !== 'word/document.xml' && !entry.isDirectory) {
      entries.push({ entryName: entry.entryName, data: entry.getData() });
    }
  }
  return entries;
}

/** Tệp ghi mã tái tạo, đặt trong zip kết quả. */
export const SEED_NOTE_FILENAME = 'THONG_TIN_BO_DE.txt';

/**
 * Ghi lại đúng những gì cần để dựng lại bộ đề này.
 *
 * Không có tệp này thì mất tệp kết quả là mất luôn bộ đề: mỗi lần bấm trộn cho ra một
 * thứ tự khác, và bảng đáp án cũ không còn khớp để chấm.
 */
export function buildSeedNote(seed: number, codes: number[], flags: ShuffleFlags): string {
  const onOff = (v: boolean) => (v ? 'có' : 'không');
  return [
    'THÔNG TIN BỘ ĐỀ NÀY',
    '',
    `Mã tái tạo (seed) : ${seed}`,
    `Mã đề bắt đầu     : ${codes[0]}`,
    `Số mã đề          : ${codes.length}`,
    `Trộn thứ tự câu   : ${onOff(flags.shuffleQuestions)}`,
    `Trộn phương án    : ${onOff(flags.shuffleChoices)}`,
    `Trộn mệnh đề Đ/S  : ${onOff(flags.shuffleStatements)}`,
    '',
    'CÁCH DỰNG LẠI ĐÚNG BỘ ĐỀ NÀY',
    '',
    'Nếu lỡ mất tệp kết quả, hãy trộn lại với ĐÚNG tệp .docx gốc, đúng mã đề bắt đầu,',
    'đúng các tuỳ chọn ở trên, và điền mã tái tạo vào ô "Mã tái tạo (seed)". Kết quả sẽ',
    'trùng khớp từng mã đề, kể cả bảng đáp án.',
    '',
    'Không điền mã tái tạo thì mỗi lần trộn cho ra một bộ đề KHÁC — đó là hành vi mặc',
    'định và cũng là điều mong muốn khi tạo đề cho một kỳ thi mới.',
    '',
    'Lưu ý: mã này chỉ có ý nghĩa cùng với đúng tệp đề gốc. Sửa nội dung tệp gốc rồi trộn',
    'lại với cùng mã sẽ KHÔNG ra bộ đề cũ.'
  ].join('\n');
}

function hasFooterParts(entries: DocxEntry[]): boolean {
  return entries.some(
    entry => entry.entryName.startsWith('word/footer') && entry.entryName.endsWith('.xml')
  );
}

/**
 * Sinh toàn bộ bộ đề: bản học sinh và bản giáo viên cho từng mã, kèm bảng đáp án,
 * tệp Excel cho TNMaker, mã QR chấm điểm và ghi chú (nếu có câu không trộn được).
 */
export async function buildShuffledExamZip(input: ShufflePipelineInput): Promise<AdmZip> {
  const { examData, documentXmlText, baseDocxEntries, codes, flags } = input;
  const resultZip = input.resultZip ?? new AdmZip();
  // Một seed cho CẢ bộ đề — không phải mỗi mã một seed, nếu không `code` mất tác dụng
  // và bộ đề không tái tạo được. Xem shuffleExamData().
  const seed = input.seed ?? Math.floor(Math.random() * 1_000_000);
  const hasFooterFiles = hasFooterParts(baseDocxEntries);
  const allKeys: Record<number, any> = {};

  // Nén phần tĩnh (ảnh, styles, fonts...) MỘT lần cho cả bộ đề. Xem prepareDocxTemplate()
  // để biết vì sao: làm trong vòng lặp thì cùng bộ ảnh bị nén lại 2 lần mỗi mã đề.
  const docxTemplate = prepareDocxTemplate(baseDocxEntries);

  for (const code of codes) {
    // Nhường quyền cho event loop giữa các mã đề: exportShuffledXml là JavaScript đồng
    // bộ và chiếm phần lớn thời gian, không nhả ra thì request khác bị treo sau nó.
    await new Promise(resolve => setImmediate(resolve));

    const { shuffled_parts, key_map } = shuffleExamData(
      examData.parts,
      code,
      seed,
      flags.shuffleQuestions,
      flags.shuffleChoices,
      flags.shuffleStatements
    );
    allKeys[code] = key_map;

    for (const isTeacher of [false, true]) {
      const xml = exportShuffledXml(
        shuffled_parts,
        examData.header_elements,
        examData.footer_elements,
        examData.part_headers,
        documentXmlText,
        isTeacher,
        String(code),
        hasFooterFiles
      );
      const docxBuffer = buildModifiedDocxZip(docxTemplate, xml, String(code));
      const name = isTeacher ? `De_GiaoVien_${code}_CoDapAn.docx` : `De_HocSinh_${code}.docx`;
      resultZip.addFile(name, docxBuffer);
    }
  }

  resultZip.addFile(
    SEED_NOTE_FILENAME,
    Buffer.from('﻿' + buildSeedNote(seed, codes, flags), 'utf-8')
  );

  resultZip.addFile('Bang_Dap_An_Tong_Hop.docx', await generateKeyTableDoc(allKeys));
  resultZip.addFile('Dap_An_TNMaker.xlsx', exportTnmakerExcel(allKeys));
  await generateTnmakerAnswersAndQr(allKeys, resultZip);

  // Câu không đọc được cấu trúc thì engine bỏ qua khâu trộn cho riêng nó, im lặng.
  // Hai endpoint này đều không trả `warnings` về client (chỉ /api/validate trả), nên
  // ghi chú phải nằm trong chính tệp zip.
  const shuffleNote = buildShuffleNote(examData);
  if (shuffleNote) {
    resultZip.addFile(SHUFFLE_NOTE_FILENAME, Buffer.from('﻿' + shuffleNote, 'utf-8'));
  }

  return resultZip;
}
