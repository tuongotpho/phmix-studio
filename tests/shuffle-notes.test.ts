import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseExam } from '../src/shuffler/index.js';
import { buildShuffleNote } from '../src/services/shuffle-notes.js';
import { body, textPara, run } from './helpers/wordml.js';

/**
 * Câu mà parser không đọc được cấu trúc sẽ bị engine bỏ qua khâu trộn: nó vẫn nằm
 * trong đề nhưng giữ nguyên thứ tự phương án ở MỌI mã đề, và ô đáp án để trống.
 * Trước đây chuyện đó diễn ra im lặng vì /api/shuffle không trả warnings về client.
 */

const PART1_HEADER = 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn';
const TAB = '<w:r><w:tab/></w:r>';

/** Đoạn phương án; truyền nhãn tuỳ ý để dựng được cả trường hợp gõ sai. */
function choicesPara(labels: string[]): string {
  const parts: string[] = [];
  labels.forEach((letter, i) => {
    parts.push(run(`${letter}. Phương án ${i + 1}`, i === 1));
    if (i < labels.length - 1) parts.push(TAB);
  });
  return `<w:p><w:pPr/>${parts.join('')}</w:p>`;
}

const examWith = (...questions: string[][]) =>
  body(
    textPara('ĐỀ KIỂM TRA THỬ'),
    textPara(PART1_HEADER),
    ...questions.flatMap((labels, i) => [
      textPara(`Câu ${i + 1}. Nội dung câu hỏi số ${i + 1}?`),
      choicesPara(labels)
    ])
  );

const OK = ['A', 'B', 'C', 'D'];

describe('ghi chú câu không trộn được', () => {
  it('không sinh ghi chú khi mọi câu đều đọc được', () => {
    const note = buildShuffleNote(parseExam(examWith(OK, OK), {}));
    assert.strictEqual(note, null);
  });

  it('nêu đúng số câu khi nhãn phương án bị gõ trùng', () => {
    // Đúng lỗi trong đề thật: phương án thứ tư gõ "A." thay vì "D.".
    const note = buildShuffleNote(parseExam(examWith(OK, ['A', 'B', 'C', 'A']), {}));

    assert.ok(note, 'phải có ghi chú');
    assert.match(note!, /Câu 2/);
    assert.doesNotMatch(note!, /Câu 1\b/, 'câu bình thường không được liệt kê');
    assert.match(note!, /Có 1 câu/);
  });

  it('nêu đúng số câu khi thiếu hẳn một phương án', () => {
    const note = buildShuffleNote(parseExam(examWith(['A', 'B', 'C']), {}));
    assert.ok(note);
    assert.match(note!, /không nhận ra đủ 4 phương án/);
  });

  it('nói rõ hậu quả, không chỉ báo lỗi suông', () => {
    const note = buildShuffleNote(parseExam(examWith(['A', 'B', 'C', 'A']), {}))!;

    assert.match(note, /GIỮ NGUYÊN ở tất cả các mã đề/, 'phải nói thứ tự không đổi');
    assert.match(note, /để trống/, 'phải nói ô đáp án bị trống');
    assert.match(note, /Cách xử lý/, 'phải hướng dẫn khắc phục');
    assert.match(note, /dùng được bình thường/, 'phải trấn an phần còn lại vẫn ổn');
  });

  it('mọi dòng đủ ngắn để đọc trong Notepad', () => {
    const note = buildShuffleNote(parseExam(examWith(['A', 'B', 'C', 'A']), {}))!;
    const tooLong = note.split('\n').filter(l => l.length > 90);
    assert.deepStrictEqual(tooLong, [], 'không dòng nào được vượt 90 ký tự');
  });
});
