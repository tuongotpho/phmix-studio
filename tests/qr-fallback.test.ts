import { describe, it } from 'node:test';
import assert from 'node:assert';
import AdmZip from 'adm-zip';
import { generateTnmakerAnswersAndQr } from '../src/services/export.service.js';
import { MAX_CODES_PER_REQUEST } from '../src/config/limits.js';

/** Dựng key_map giống đầu ra của shuffleExamData. */
function keysFor(numCodes: number, part3Answer: string) {
  const all: Record<number, Record<number, any[]>> = {};
  for (let c = 101; c < 101 + numCodes; c++) {
    all[c] = {
      1: Array.from({ length: 18 }, (_, i) => ({ old_num: i + 1, new_num: i + 1, answer: 'A' })),
      2: Array.from({ length: 4 }, (_, i) => ({
        old_num: i + 1, new_num: i + 1, answer: { a: true, b: false, c: true, d: false }
      })),
      3: Array.from({ length: 6 }, (_, i) => ({ old_num: i + 1, new_num: i + 1, answer: part3Answer }))
    };
  }
  return all;
}

describe('QR chấm điểm TNMaker — không được hỏng trong im lặng', () => {
  it('tạo được mã QR ở mức mã đề tối đa cho phép', async () => {
    const zip = new AdmZip();
    await generateTnmakerAnswersAndQr(keysFor(MAX_CODES_PER_REQUEST, '12.5'), zip);

    assert.ok(zip.getEntry('MaQR_ChamDiem_TNMaker.png'), 'phải có mã QR');
    assert.strictEqual(zip.getEntry('LUU_Y_THIEU_MA_QR.txt'), null, 'không được kèm ghi chú lỗi');
  });

  it('khi vượt sức chứa QR thì để lại ghi chú trong zip, không im lặng', async () => {
    // Đáp án Phần III là văn bản người dùng tự nhập từ tệp .docx, nên chuỗi QR vẫn có
    // thể phình vượt sức chứa NGAY CẢ khi số mã đề nằm trong giới hạn — đây là lý do
    // nhánh này phải xử lý tử tế chứ không chỉ dựa vào trần số mã đề.
    const zip = new AdmZip();
    await generateTnmakerAnswersAndQr(keysFor(MAX_CODES_PER_REQUEST, 'x'.repeat(200)), zip);

    assert.strictEqual(zip.getEntry('MaQR_ChamDiem_TNMaker.png'), null, 'QR không tạo được');

    const note = zip.getEntry('LUU_Y_THIEU_MA_QR.txt');
    assert.ok(note, 'phải để lại ghi chú giải thích cho người dùng');

    const text = note!.getData().toString('utf-8');
    assert.match(text, /KHÔNG TẠO ĐƯỢC MÃ QR/);
    assert.match(text, /VẪN DÙNG ĐƯỢC/, 'phải nói rõ phần còn lại của bộ đề vẫn dùng được');
    assert.match(text, /Cách xử lý/, 'phải hướng dẫn cách khắc phục');
  });

  it('không tạo tệp nào khi không có mã đề nào', async () => {
    const zip = new AdmZip();
    await generateTnmakerAnswersAndQr({}, zip);
    assert.strictEqual(zip.getEntries().length, 0);
  });
});
