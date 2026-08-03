import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseExam, shuffleExamData, exportShuffledXml } from '../src/shuffler/index.js';
import {
  body,
  para,
  run,
  textPara,
  choicesSinglePara,
  choicesFourParas,
  choiceParaWithEmphasis
} from './helpers/wordml.js';

const PART1_HEADER = 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn';

function examPart1(...optionBlocks: string[]): string {
  return body(
    textPara('ĐỀ KIỂM TRA THỬ'),
    textPara(PART1_HEADER),
    textPara('Câu 1. Thủ đô của Việt Nam là thành phố nào?'),
    ...optionBlocks
  );
}

const OPTS = { A: 'Đà Nẵng', B: 'Hà Nội', C: 'Huế', D: 'Cần Thơ' } as const;

describe('parseExam — nhận diện đáp án Phần I', () => {
  it('single_para: gạch chân nhãn B thì đáp án là B', () => {
    const data = parseExam(examPart1(choicesSinglePara(OPTS, ['B'])), {});

    assert.strictEqual(data.parts[1].length, 1);
    const info = data.parts[1][0].choices_info!;
    assert.strictEqual(info.layout, 'single_para');
    assert.strictEqual(info.correct_answer, 'B');
  });

  it('four_paras: gạch chân nhãn C thì đáp án là C', () => {
    const data = parseExam(examPart1(...choicesFourParas(OPTS, ['C'])), {});

    const info = data.parts[1][0].choices_info!;
    assert.strictEqual(info.layout, 'four_paras');
    assert.strictEqual(info.correct_answer, 'C');
  });

  it('gạch chân nhấn mạnh trong NỘI DUNG không được coi là chọn đáp án', () => {
    // Nhãn A gạch chân (đáp án thật). Phương án C có một từ trong nội dung được
    // gạch chân để nhấn mạnh — trước đây bị hiểu là đáp án và ghi đè lên A.
    const opts = choicesFourParas(OPTS, ['A']);
    const data = parseExam(
      examPart1(opts[0], opts[1], choiceParaWithEmphasis('C', 'Huế từng là ', 'cố đô'), opts[3]),
      {}
    );

    const info = data.parts[1][0].choices_info!;
    assert.strictEqual(info.correct_answer, 'A');
  });

  it('hai phương án cùng gạch chân nhãn: không tự chọn, phải cảnh báo', () => {
    const data = parseExam(examPart1(...choicesFourParas(OPTS, ['A', 'D'])), {});

    const info = data.parts[1][0].choices_info!;
    assert.strictEqual(
      info.correct_answer,
      null,
      'không được im lặng chọn phương án cuối khi đề mơ hồ'
    );
    assert.ok(
      data.warnings.some(w => w.includes('Câu hỏi 1') && w.includes('A, D')),
      `cần cảnh báo nêu rõ các phương án bị trùng, nhận được: ${JSON.stringify(data.warnings)}`
    );
  });

  it('override vẫn ghi đè được đáp án khi đề mơ hồ', () => {
    const data = parseExam(examPart1(...choicesFourParas(OPTS, ['A', 'D'])), { '1': 'B' });

    assert.strictEqual(data.parts[1][0].choices_info!.correct_answer, 'B');
  });
});

describe('exportShuffledXml — giữ nguyên nội dung xen giữa các phương án', () => {
  it('đoạn nằm giữa các phương án không bị xoá khỏi đề học sinh', () => {
    const MARKER = 'HINH_ANH_XEN_GIUA';
    const opts = choicesFourParas(OPTS, ['B']);
    const xml = examPart1(opts[0], opts[1], textPara(MARKER), opts[2], opts[3]);

    const data = parseExam(xml, {});
    assert.strictEqual(data.parts[1][0].choices_info!.layout, 'four_paras');

    const { shuffled_parts } = shuffleExamData(data.parts, 101, 1, true, true, true);
    const out = exportShuffledXml(
      shuffled_parts,
      data.header_elements,
      data.footer_elements,
      data.part_headers,
      xml,
      false,
      '101',
      false
    );

    assert.ok(
      out.includes(MARKER),
      'đoạn xen giữa các phương án bị splice xoá mất khỏi đề đầu ra'
    );
  });

  it('đáp án sau khi trộn vẫn trỏ đúng phương án gốc', () => {
    const data = parseExam(examPart1(choicesSinglePara(OPTS, ['B'])), {});
    const { shuffled_parts, key_map } = shuffleExamData(data.parts, 101, 1, true, true, true);

    const q = shuffled_parts[1][0];
    const newCorrect = key_map[1][0].answer as string;
    // Nhãn mới của đáp án phải ánh xạ ngược về đúng phương án B ban đầu.
    const positionOfNewLabel = ['A', 'B', 'C', 'D'].indexOf(newCorrect);
    assert.strictEqual(q.shuffled_info.new_order[positionOfNewLabel], 'B');
  });
});

describe('parseExam — Phần II và Phần III', () => {
  it('Phần II: gạch chân mệnh đề b và d thì hai mệnh đề đó là Đúng', () => {
    const xml = body(
      textPara('PHẦN II. Câu trắc nghiệm đúng sai'),
      textPara('Câu 1. Xét các phát biểu sau:'),
      para(run('a) Phát biểu thứ nhất')),
      para(run('b) Phát biểu thứ hai', true)),
      para(run('c) Phát biểu thứ ba')),
      para(run('d) Phát biểu thứ tư', true))
    );

    const info = parseExam(xml, {}).parts[2][0].statements_info!;
    assert.deepStrictEqual(info.correct_answers, { a: false, b: true, c: false, d: true });
  });

  it('Phần III: đọc được giá trị từ dòng "Đáp án:"', () => {
    const xml = body(
      textPara('PHẦN III. Câu trắc nghiệm trả lời ngắn'),
      textPara('Câu 1. Tính giá trị của biểu thức.'),
      textPara('Đáp án: 12,5')
    );

    assert.strictEqual(parseExam(xml, {}).parts[3][0].short_answer_info!.answer_value, '12,5');
  });
});
