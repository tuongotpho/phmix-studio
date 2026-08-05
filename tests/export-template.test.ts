import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DOMParser } from '@xmldom/xmldom';
import { parseExam, shuffleExamData, exportShuffledXml } from '../src/shuffler/index.js';
import { body, textPara, run } from './helpers/wordml.js';

/**
 * exportShuffledXml nhận `string | Document` làm mẫu. Hai đường PHẢI cho ra kết quả
 * y hệt nhau — đó là điều kiện để nơi gọi truyền chuỗi thay vì DOM.
 *
 * Vì sao quan trọng: mỗi mã đề cần một cây DOM sạch riêng. Truyền DOM thì
 * exportShuffledXml lấy bản sạch bằng cloneNode(true) (~159ms/lượt trên đề 220KB),
 * truyền chuỗi thì nó parse lại (~69ms) — nhanh hơn 21% end-to-end. Test này chốt
 * lại tính tương đương, để không ai "tối ưu" ngược về DOM mà tưởng là cải thiện.
 */

const PART1_HEADER = 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn';
const TAB = '<w:r><w:tab/></w:r>';
const OPTS: Record<string, string> = { A: 'Đà Nẵng', B: 'Hà Nội', C: 'Huế', D: 'Cần Thơ' };

/** Đoạn 4 phương án trên một dòng, gạch chân phương án đúng. */
function choicesPara(underlined: string): string {
  const parts: string[] = [];
  ['A', 'B', 'C', 'D'].forEach((letter, i) => {
    parts.push(run(`${letter}. ${OPTS[letter]}`, letter === underlined));
    if (i < 3) parts.push(TAB);
  });
  return `<w:p>${parts.join('')}</w:p>`;
}

const EXAM_XML = body(
  textPara('ĐỀ KIỂM TRA THỬ'),
  textPara(PART1_HEADER),
  textPara('Câu 1. Thủ đô của Việt Nam là thành phố nào?'),
  choicesPara('B'),
  textPara('Câu 2. Thành phố nào nằm bên sông Hàn?'),
  choicesPara('A'),
  textPara('Câu 3. Cố đô của Việt Nam là thành phố nào?'),
  choicesPara('C')
);

describe('exportShuffledXml — mẫu dạng chuỗi và dạng DOM phải tương đương', () => {
  const examData = parseExam(EXAM_XML, {});

  function render(template: string | any, code: number, teacher: boolean): string {
    // Seed cố định: hai đường phải nhận CÙNG phép trộn thì so sánh mới có nghĩa.
    const { shuffled_parts } = shuffleExamData(examData.parts, code, 42, true, true, true);
    return exportShuffledXml(
      shuffled_parts, examData.header_elements, examData.footer_elements,
      examData.part_headers, template, teacher, String(code), false
    );
  }

  it('đề mẫu phải parse ra đủ 3 câu, nếu không thì test bên dưới vô nghĩa', () => {
    assert.strictEqual(examData.parts[1].length, 3);
  });

  it('cho ra XML giống hệt nhau, cả bản học sinh lẫn bản giáo viên', () => {
    for (const code of [101, 102, 103]) {
      for (const teacher of [false, true]) {
        const fromDom = render(new DOMParser().parseFromString(EXAM_XML, 'text/xml'), code, teacher);
        const fromString = render(EXAM_XML, code, teacher);
        assert.strictEqual(
          fromString, fromDom,
          `lệch ở mã ${code}, bản ${teacher ? 'giáo viên' : 'học sinh'}`
        );
      }
    }
  });

  it('mẫu dùng lại nhiều lần không bị nhiễm bẩn giữa các mã đề', () => {
    // Nếu exportShuffledXml lỡ sửa vào cây mẫu dùng chung thay vì bản sao, mã đề thứ
    // hai sẽ kéo theo dấu vết của mã thứ nhất. Đây đúng là cái bẫy mà đường truyền
    // DOM dễ mắc, nên khoá lại cho cả hai đường.
    for (const template of [EXAM_XML, new DOMParser().parseFromString(EXAM_XML, 'text/xml')]) {
      const first = render(template, 101, false);
      render(template, 102, false);
      render(template, 103, true);
      assert.strictEqual(render(template, 101, false), first,
        'cùng mã đề + cùng seed phải luôn ra cùng kết quả');
    }
  });
});
