import { describe, it } from 'node:test';
import assert from 'node:assert';
import { XMLSerializer } from '@xmldom/xmldom';
import { parseExam, shuffleExamData, exportShuffledXml, getNodeText } from '../src/shuffler/index.js';
import { body, textPara, choicesFourParas } from './helpers/wordml.js';

/**
 * Bố cục four_paras (mỗi phương án một đoạn riêng) đi qua nhánh xử lý khác hẳn
 * single_para/two_paras: nó nhân bản NGUYÊN CẢ ĐOẠN của phương án thay vì cắt ghép
 * các run trong một đoạn. parser.test.ts đã phủ khâu nhận dạng; chỗ này phủ vòng
 * tròn đầy đủ trộn -> xuất -> đọc lại, thứ mà một lỗi ở nhánh clone sẽ làm gãy.
 */

const PART1_HEADER = 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn';

const QUESTIONS = [
  { opts: { A: 'Đà Nẵng', B: 'Hà Nội', C: 'Huế', D: 'Cần Thơ' }, dung: 'B' as const },
  { opts: { A: 'Sông Hồng', B: 'Sông Mã', C: 'Sông Đồng Nai', D: 'Sông Mekong' }, dung: 'D' as const },
  { opts: { A: 'Fansipan', B: 'Bà Đen', C: 'Ngọc Linh', D: 'Pu Ta Leng' }, dung: 'A' as const }
];

const EXAM_XML = body(
  textPara('ĐỀ KIỂM TRA THỬ'),
  textPara(PART1_HEADER),
  ...QUESTIONS.flatMap((q, i) => [
    textPara(`Câu ${i + 1}. Nội dung câu hỏi số ${i + 1}?`),
    ...choicesFourParas(q.opts, [q.dung])
  ])
);

const ser = new XMLSerializer();
const textOf = (el: any) => getNodeText(el).replace(/^\s*[A-D]\.\s*/, '').replace(/\s+/g, ' ').trim();

describe('four_paras — vòng tròn trộn, xuất, đọc lại', () => {
  const data = parseExam(EXAM_XML, {});

  it('đề mẫu phải parse đúng bố cục và đáp án, nếu không mọi kiểm tra dưới đều vô nghĩa', () => {
    assert.strictEqual(data.parts[1].length, 3);
    assert.deepStrictEqual(
      data.parts[1].map(q => q.choices_info!.layout),
      ['four_paras', 'four_paras', 'four_paras']
    );
    assert.deepStrictEqual(
      data.parts[1].map(q => q.choices_info!.correct_answer),
      ['B', 'D', 'A']
    );
  });

  for (const code of [101, 102, 103, 104, 105]) {
    it(`mã ${code}: giữ đủ 4 phương án, bảng đáp án trỏ đúng, bản GV gạch chân đúng`, () => {
      const { shuffled_parts, key_map } = shuffleExamData(data.parts, code, null, true, true, true);
      const teacherXml = exportShuffledXml(
        shuffled_parts, data.header_elements, data.footer_elements,
        data.part_headers, EXAM_XML, true, String(code), false
      );
      const out = parseExam(teacherXml, {});
      assert.strictEqual(out.parts[1].length, 3, 'không được mất câu nào');

      for (const q of out.parts[1]) {
        const km = key_map[1].find((k: any) => k.new_num === q.number)!;
        const goc = QUESTIONS[km.old_num - 1];
        const info = q.choices_info!;
        const noiDung = ['A', 'B', 'C', 'D'].map(c => textOf(info.options[c]));

        assert.deepStrictEqual(
          [...noiDung].sort(), Object.values(goc.opts).sort(),
          `câu ${km.old_num}: nội dung 4 phương án phải được bảo toàn, không mất không nhân bản`
        );

        const viTri = 'ABCD'.indexOf(km.answer);
        assert.ok(viTri >= 0, `câu ${km.old_num}: bảng đáp án phải có nhãn hợp lệ`);
        assert.strictEqual(
          noiDung[viTri], goc.opts[goc.dung],
          `câu ${km.old_num}: nhãn '${km.answer}' trong bảng phải trỏ đúng nội dung đáp án đúng`
        );

        assert.match(
          ser.serializeToString(info.options[km.answer]), /<w:u\b/,
          `câu ${km.old_num}: bản giáo viên phải gạch chân đúng phương án đó`
        );
      }
    });
  }

  it('bản học sinh không được lộ đáp án qua gạch chân', () => {
    const { shuffled_parts } = shuffleExamData(data.parts, 101, null, true, true, true);
    const studentXml = exportShuffledXml(
      shuffled_parts, data.header_elements, data.footer_elements,
      data.part_headers, EXAM_XML, false, '101', false
    );

    for (const q of parseExam(studentXml, {}).parts[1]) {
      for (const c of ['A', 'B', 'C', 'D']) {
        assert.doesNotMatch(
          ser.serializeToString(q.choices_info!.options[c]), /<w:u\b/,
          `câu ${q.number}, phương án ${c}: bản học sinh không được có gạch chân`
        );
      }
    }
  });
});
