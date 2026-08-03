import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DOMParser } from '@xmldom/xmldom';
import { parseExam, shuffleExamData, exportShuffledXml } from '../src/shuffler/index.js';
import { getUsableWidthTwips, chooseColumnCount } from '../src/shuffler/tab-layout.js';
import { body, textPara, choicesSinglePara } from './helpers/wordml.js';

const PART1_HEADER = 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn';

function examPart1(...optionBlocks: string[]): string {
  return body(
    textPara('ĐỀ KIỂM TRA THỬ'),
    textPara(PART1_HEADER),
    textPara('Câu 1. Thủ đô của Việt Nam là thành phố nào?'),
    ...optionBlocks
  );
}

function parseXml(xml: string): any {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

/** Dựng dãy node giả cho chooseColumnCount — nó chỉ đọc text qua w:t. */
function optionNodes(...texts: string[]): any[][] {
  return texts.map(t => {
    const doc = parseXml(
      `<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:t>${t}</w:t></w:r>`
    );
    return [doc.documentElement];
  });
}

const A4_USABLE = 11906 - 1440 - 1440;

describe('getUsableWidthTwips', () => {
  it('sectPr rỗng thì quay về A4 lề 2.54cm', () => {
    const doc = parseXml(
      '<w:sectPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>'
    );
    assert.strictEqual(getUsableWidthTwips(doc.documentElement), A4_USABLE);
  });

  it('đọc đúng khổ giấy và lề tuỳ biến', () => {
    const doc = parseXml(
      '<w:sectPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:pgSz w:w="12240" w:h="15840"/>' +
      '<w:pgMar w:top="1440" w:right="1080" w:bottom="1440" w:left="1080"/>' +
      '</w:sectPr>'
    );
    assert.strictEqual(getUsableWidthTwips(doc.documentElement), 12240 - 1080 - 1080);
  });

  it('lề vô lý thì bỏ qua, không dựng tab stop theo số rác', () => {
    const doc = parseXml(
      '<w:sectPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:pgSz w:w="11906"/><w:pgMar w:left="9000" w:right="9000"/>' +
      '</w:sectPr>'
    );
    assert.strictEqual(getUsableWidthTwips(doc.documentElement), A4_USABLE);
  });
});

describe('chooseColumnCount — giảm cột theo phương án dài nhất', () => {
  it('phương án ngắn thì xếp 4 cột', () => {
    const cols = chooseColumnCount(optionNodes('A. Hà Nội', 'B. Huế', 'C. Đà Nẵng', 'D. Cần Thơ'), A4_USABLE);
    assert.strictEqual(cols, 4);
  });

  it('một phương án dài vừa thì hạ xuống 2 cột', () => {
    const cols = chooseColumnCount(
      optionNodes('A. Hà Nội', 'B. Thành phố Hồ Chí Minh xưa', 'C. Huế', 'D. Cần Thơ'),
      A4_USABLE
    );
    assert.strictEqual(cols, 2);
  });

  it('phương án quá dài thì mỗi phương án một dòng', () => {
    const long = 'D. ' + 'chữ rất dài '.repeat(8);
    const cols = chooseColumnCount(optionNodes('A. Ngắn', 'B. Ngắn', 'C. Ngắn', long), A4_USABLE);
    assert.strictEqual(cols, 1);
  });

  it('trần maxColumns được tôn trọng cho layout hai đoạn', () => {
    const cols = chooseColumnCount(optionNodes('A. X', 'B. Y', 'C. Z', 'D. W'), A4_USABLE, 2);
    assert.strictEqual(cols, 2);
  });

  it('phương án chứa ảnh thì không ép nhiều cột', () => {
    const doc = parseXml(
      '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:drawing/></w:r>'
    );
    const cols = chooseColumnCount([[doc.documentElement], ...optionNodes('B. Y', 'C. Z', 'D. W')], A4_USABLE);
    assert.strictEqual(cols, 1);
  });
});

describe('exportShuffledXml — căn đều phương án', () => {
  const OPTS = { A: 'Đà Nẵng', B: 'Hà Nội', C: 'Huế', D: 'Cần Thơ' } as const;

  function shuffleAndExport(xml: string): string {
    const data = parseExam(xml, {});
    const { shuffled_parts } = shuffleExamData(data.parts, 101, 1, true, true, true);
    return exportShuffledXml(
      shuffled_parts,
      data.header_elements,
      data.footer_elements,
      data.part_headers,
      xml,
      false,
      '101',
      false
    );
  }

  it('sinh w:tabs với các mốc chia đều bề rộng trang', () => {
    const out = shuffleAndExport(examPart1(choicesSinglePara(OPTS, ['B'])));

    assert.ok(out.includes('<w:tabs>'), 'phải khai báo tab stop, nếu không Word dùng mốc mặc định 720 twip');
    const step = A4_USABLE / 4;
    for (let i = 1; i < 4; i++) {
      const pos = Math.round(step * i);
      assert.ok(
        out.includes(`w:pos="${pos}"`),
        `thiếu mốc tab ${pos} (cột ${i}); các mốc có trong output: ${(out.match(/w:pos="\d+"/g) || []).join(', ')}`
      );
    }
  });

  it('phương án dài thì xuống dòng bằng w:br thay vì dồn 4 cột', () => {
    const longOpts = {
      A: 'Thành phố trực thuộc trung ương nằm ở miền Bắc Việt Nam',
      B: 'Thành phố trực thuộc trung ương nằm ở miền Nam Việt Nam',
      C: 'Thành phố trực thuộc trung ương nằm ở miền Trung Việt Nam',
      D: 'Thành phố trực thuộc trung ương nằm ở đồng bằng sông Cửu Long'
    } as const;
    const out = shuffleAndExport(examPart1(choicesSinglePara(longOpts, ['B'])));

    assert.ok(out.includes('<w:br/>'), 'phương án dài phải được ngắt dòng');
  });

  it('giữ nguyên đủ 4 phương án sau khi căn lại', () => {
    const out = shuffleAndExport(examPart1(choicesSinglePara(OPTS, ['B'])));

    for (const text of Object.values(OPTS)) {
      assert.ok(out.includes(text), `mất phương án "${text}" sau khi căn đều`);
    }
  });
});
