import { describe, it } from 'node:test';
import assert from 'node:assert';
import AdmZip from 'adm-zip';
import { generateKeyTableDoc } from '../src/services/export.service.js';

/**
 * Bảng đáp án tổng hợp phải in theo đúng thứ tự Phần I → II → III, mỗi bảng nằm ngay
 * dưới tiêu đề của chính nó.
 *
 * Lỗi cũ: bảng Phần I được chèn ở cuối vòng lặp mã đề, sau cả bảng Phần II và Phần III,
 * nên giáo viên mở tệp ra thấy tiêu đề "PHẦN I" trống và một bảng vô danh ở dưới cùng.
 */

/** Đáp án mẫu: 2 câu Phần I, 1 câu Phần II, 1 câu Phần III. */
function sampleKeys() {
  return {
    101: {
      1: [
        { old_num: 1, new_num: 1, answer: 'A' },
        { old_num: 2, new_num: 2, answer: 'C' }
      ],
      2: [{ old_num: 3, new_num: 1, answer: { a: true, b: false, c: true, d: false } }],
      3: [{ old_num: 4, new_num: 1, answer: '12,5' }]
    }
  };
}

/** Văn bản thuần của word/document.xml, giữ nguyên thứ tự xuất hiện. */
function documentText(buffer: Buffer): string {
  const xml = new AdmZip(buffer).getEntry('word/document.xml')!.getData().toString('utf-8');
  return xml.replace(/<[^>]+>/g, '');
}

describe('generateKeyTableDoc — thứ tự các phần', () => {
  it('bảng Phần I nằm giữa tiêu đề Phần I và tiêu đề Phần II', async () => {
    const text = documentText(await generateKeyTableDoc(sampleKeys() as any));

    const iHeading = text.indexOf('PHẦN I.');
    const iiHeading = text.indexOf('PHẦN II.');
    const iiiHeading = text.indexOf('PHẦN III.');
    assert.ok(iHeading >= 0 && iiHeading > iHeading && iiiHeading > iiHeading, 'ba tiêu đề phải theo thứ tự');

    // "Câu 1" của bảng Phần I là ô tiêu đề cột đầu tiên — nó phải xuất hiện TRƯỚC
    // tiêu đề Phần II, nghĩa là bảng nằm đúng dưới tiêu đề Phần I.
    const p1Cell = text.indexOf('Câu 1');
    assert.ok(p1Cell > iHeading, 'bảng Phần I phải nằm sau tiêu đề Phần I');
    assert.ok(
      p1Cell < iiHeading,
      'bảng Phần I bị đẩy xuống sau Phần II — đây chính là lỗi thứ tự cũ'
    );
  });

  it('đáp án Phần I hiện đúng giá trị', async () => {
    const text = documentText(await generateKeyTableDoc(sampleKeys() as any));
    const iHeading = text.indexOf('PHẦN I.');
    const iiHeading = text.indexOf('PHẦN II.');
    const p1Block = text.slice(iHeading, iiHeading);

    assert.ok(p1Block.includes('A'), 'thiếu đáp án câu 1');
    assert.ok(p1Block.includes('C'), 'thiếu đáp án câu 2');
  });

  it('đề chỉ có Phần I vẫn in được bảng', async () => {
    const keys = { 101: { 1: [{ old_num: 1, new_num: 1, answer: 'B' }], 2: [], 3: [] } };
    const text = documentText(await generateKeyTableDoc(keys as any));

    assert.ok(text.includes('PHẦN I.'), 'phải có tiêu đề Phần I');
    assert.ok(text.includes('Câu 1'), 'phải có bảng đáp án');
    assert.ok(!text.includes('PHẦN II.'), 'không được in tiêu đề của phần rỗng');
  });
});
