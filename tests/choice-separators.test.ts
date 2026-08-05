import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseExam, shuffleExamData, exportShuffledXml } from '../src/shuffler/index.js';
import { body, textPara, run } from './helpers/wordml.js';

/**
 * Giữ mốc tab của tác giả thì phải giữ luôn SỐ tab giữa các phương án.
 *
 * Mốc tab được đặt cho đúng số tab đã gõ. Nếu giữ 7 mốc mà chỉ phát ra 3 tab thì
 * B/C/D nhảy vào ba mốc đầu và bỏ trống nửa cuối dòng — đề trộn ra không còn thẳng
 * hàng như đề gốc. Lỗi này từng xảy ra với 6/8 câu single_para của đề thật, đúng
 * những câu tác giả gõ nhiều hơn một tab mỗi khe.
 */

const PART1_HEADER = 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn';
const TAB = '<w:r><w:tab/></w:r>';
const OPTS: Record<string, string> = { A: 'Đà Nẵng', B: 'Hà Nội', C: 'Huế', D: 'Cần Thơ' };
const STOPS = [2160, 3449, 4321, 5041, 6530, 7922, 9337];

/** Đoạn 4 phương án; `gaps` là số ký tự tab của từng khe A|B, B|C, C|D. */
function choicesPara(gaps: number[], stops: number[] | null): string {
  const tabsXml = stops
    ? `<w:tabs>${stops.map(p => `<w:tab w:val="left" w:pos="${p}"/>`).join('')}</w:tabs>`
    : '';
  const parts: string[] = [];
  ['A', 'B', 'C', 'D'].forEach((letter, i) => {
    parts.push(run(`${letter}. ${OPTS[letter]}`, letter === 'B'));
    if (i < 3) parts.push(TAB.repeat(gaps[i]));
  });
  return `<w:p><w:pPr>${tabsXml}</w:pPr>${parts.join('')}</w:p>`;
}

function shuffleAndExport(xml: string): string {
  const data = parseExam(xml, {});
  assert.strictEqual(data.parts[1].length, 1, 'đề mẫu phải parse ra đúng 1 câu');
  assert.ok(data.parts[1][0].choices_info, 'phải nhận ra 4 phương án');
  const { shuffled_parts } = shuffleExamData(data.parts, 101, 7, true, true, true);
  return exportShuffledXml(
    shuffled_parts, data.header_elements, data.footer_elements,
    data.part_headers, xml, false, '101', false
  );
}

const examWith = (gaps: number[], stops: number[] | null) =>
  body(textPara('ĐỀ KIỂM TRA THỬ'), textPara(PART1_HEADER),
    textPara('Câu 1. Thủ đô của Việt Nam là thành phố nào?'), choicesPara(gaps, stops));

const countTabs = (xml: string) => (xml.match(/<w:tab\s*\/>/g) || []).length;
const listStops = (xml: string) => (xml.match(/w:pos="(\d+)"/g) || []).map(s => s.match(/\d+/)![0]);

describe('dấu phân cách phương án — giữ đúng lưới tab của đề gốc', () => {
  it('giữ nguyên số tab mỗi khe khi đề gốc tự khai mốc tab', () => {
    const out = shuffleAndExport(examWith([2, 3, 1], STOPS));

    assert.strictEqual(countTabs(out), 6, 'phải giữ đủ 2+3+1 tab, không bóp về 3');
    assert.deepStrictEqual(listStops(out), STOPS.map(String), 'mốc tab phải giữ nguyên');
  });

  it('số mốc và số tab phải nhất quán với nhau', () => {
    // Đây là bất biến thật sự: mốc nhiều hơn tab thì cột cuối bỏ trống, và đó
    // chính là hình dạng của lỗi cũ.
    const out = shuffleAndExport(examWith([2, 3, 2], STOPS));
    assert.strictEqual(countTabs(out), 7);
    assert.strictEqual(listStops(out).length, 7);
  });

  it('vẫn chuẩn hoá về một tab mỗi khe khi đề gốc KHÔNG khai mốc', () => {
    // Nhánh applyEvenTabStops giữ nguyên hành vi cũ: không có mốc của tác giả để
    // tôn trọng, nên chia cột đều và một tab mỗi khe là đúng.
    const out = shuffleAndExport(examWith([3, 1, 3], null));

    assert.strictEqual(countTabs(out), 3, 'ba khe, mỗi khe một tab');
    assert.ok(listStops(out).length > 0, 'phải tự thêm mốc chia đều');
  });
});
