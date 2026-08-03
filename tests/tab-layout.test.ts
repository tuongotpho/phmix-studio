import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DOMParser } from '@xmldom/xmldom';
import { parseExam, shuffleExamData, exportShuffledXml } from '../src/shuffler/index.js';
import {
  getUsableWidthTwips,
  separatorHasBreak,
  hasExplicitTabStops,
  columnsFromBreaks
} from '../src/shuffler/tab-layout.js';
import { body, textPara, run, escapeXml } from './helpers/wordml.js';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const PART1_HEADER = 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn';
const A4_USABLE = 11906 - 1440 - 1440;

const OPTS = { A: 'Đà Nẵng', B: 'Hà Nội', C: 'Huế', D: 'Cần Thơ' } as const;
type Letter = keyof typeof OPTS;
const LETTERS: Letter[] = ['A', 'B', 'C', 'D'];

function parseXml(xml: string): any {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

const tabRun = '<w:r><w:tab/></w:r>';
const brRun = '<w:r><w:br/></w:r>';
const spaceRun = '<w:r><w:t xml:space="preserve">   </w:t></w:r>';

/**
 * Dựng đoạn 4 phương án với dấu phân cách chỉ định cho từng vị trí, và tuỳ chọn
 * khai báo sẵn tab stop giống đề giáo viên tự căn.
 */
function choicesPara(separators: string[], underlined: Letter = 'B', tabStops?: number[]): string {
  const tabsXml = tabStops
    ? `<w:tabs>${tabStops.map(p => `<w:tab w:val="left" w:pos="${p}"/>`).join('')}</w:tabs>`
    : '';
  const parts: string[] = [];
  LETTERS.forEach((letter, i) => {
    parts.push(run(`${letter}. ${OPTS[letter]}`, letter === underlined));
    if (i < 3) parts.push(separators[i]);
  });
  return `<w:p><w:pPr>${tabsXml}</w:pPr>${parts.join('')}</w:p>`;
}

function examPart1(optionBlock: string): string {
  return body(
    textPara('ĐỀ KIỂM TRA THỬ'),
    textPara(PART1_HEADER),
    textPara('Câu 1. Thủ đô của Việt Nam là thành phố nào?'),
    optionBlock
  );
}

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

function tabPositions(xml: string): number[] {
  return (xml.match(/w:pos="(\d+)"/g) || []).map(m => parseInt(m.replace(/\D/g, ''), 10));
}

describe('getUsableWidthTwips', () => {
  it('sectPr rỗng thì quay về A4 lề 2.54cm', () => {
    const doc = parseXml(`<w:sectPr xmlns:w="${W_NS}"/>`);
    assert.strictEqual(getUsableWidthTwips(doc.documentElement), A4_USABLE);
  });

  it('đọc đúng khổ giấy và lề tuỳ biến', () => {
    const doc = parseXml(
      `<w:sectPr xmlns:w="${W_NS}">` +
      '<w:pgSz w:w="12240" w:h="15840"/>' +
      '<w:pgMar w:top="1440" w:right="1080" w:bottom="1440" w:left="1080"/>' +
      '</w:sectPr>'
    );
    assert.strictEqual(getUsableWidthTwips(doc.documentElement), 12240 - 1080 - 1080);
  });

  it('lề vô lý thì bỏ qua, không dựng mốc tab theo số rác', () => {
    const doc = parseXml(
      `<w:sectPr xmlns:w="${W_NS}"><w:pgSz w:w="11906"/><w:pgMar w:left="9000" w:right="9000"/></w:sectPr>`
    );
    assert.strictEqual(getUsableWidthTwips(doc.documentElement), A4_USABLE);
  });
});

describe('đo lưới của đề gốc', () => {
  const nodesOf = (xml: string) => [parseXml(`<w:r xmlns:w="${W_NS}">${xml}</w:r>`).documentElement];

  it('separatorHasBreak nhận ra w:br', () => {
    assert.strictEqual(separatorHasBreak(nodesOf('<w:br/>')), true);
    assert.strictEqual(separatorHasBreak(nodesOf('<w:tab/>')), false);
    assert.strictEqual(separatorHasBreak([]), false);
  });

  it('columnsFromBreaks: không ngắt dòng nào thì cả 4 nằm một hàng', () => {
    assert.strictEqual(columnsFromBreaks([false, false, false], 4), 4);
  });

  it('columnsFromBreaks: ngắt sau phương án thứ 2 thì lưới 2 cột', () => {
    assert.strictEqual(columnsFromBreaks([false, true, false], 4), 2);
  });

  it('columnsFromBreaks: ngắt sau mỗi phương án thì mỗi hàng một cột', () => {
    assert.strictEqual(columnsFromBreaks([true, true, true], 4), 1);
  });

  it('hasExplicitTabStops phân biệt được đoạn đã tự căn', () => {
    const withTabs = parseXml(
      `<w:p xmlns:w="${W_NS}"><w:pPr><w:tabs><w:tab w:val="left" w:pos="3000"/></w:tabs></w:pPr></w:p>`
    );
    const withoutTabs = parseXml(`<w:p xmlns:w="${W_NS}"><w:pPr/></w:p>`);
    assert.strictEqual(hasExplicitTabStops(withTabs.documentElement), true);
    assert.strictEqual(hasExplicitTabStops(withoutTabs.documentElement), false);
  });
});

describe('exportShuffledXml — giữ nguyên cách dàn của đề gốc', () => {
  it('đề gốc 4 phương án một hàng: bổ sung mốc tab chia 4', () => {
    const out = shuffleAndExport(examPart1(choicesPara([tabRun, tabRun, tabRun])));

    const step = A4_USABLE / 4;
    const expected = [1, 2, 3].map(i => Math.round(step * i));
    for (const pos of expected) {
      assert.ok(tabPositions(out).includes(pos), `thiếu mốc tab ${pos}; có: ${tabPositions(out).join(', ')}`);
    }
    assert.ok(!out.includes('<w:br/>'), 'đề gốc không xuống dòng thì đề trộn cũng không được xuống dòng');
  });

  it('đề gốc 2 phương án mỗi hàng: giữ đúng chỗ xuống dòng và chia 2 cột', () => {
    const out = shuffleAndExport(examPart1(choicesPara([tabRun, brRun, tabRun])));

    assert.strictEqual(
      (out.match(/<w:br\/>/g) || []).length, 1,
      'phải giữ đúng một lần xuống dòng như đề gốc'
    );
    assert.ok(
      tabPositions(out).includes(Math.round(A4_USABLE / 2)),
      `lưới 2 cột phải có mốc giữa trang; có: ${tabPositions(out).join(', ')}`
    );
  });

  it('đề gốc mỗi phương án một hàng: không chèn mốc tab nào', () => {
    const out = shuffleAndExport(examPart1(choicesPara([brRun, brRun, brRun])));

    assert.strictEqual((out.match(/<w:br\/>/g) || []).length, 3);
    assert.strictEqual(tabPositions(out).length, 0, 'lưới một cột thì không cần mốc tab');
  });

  it('đề gốc đã tự đặt tab stop: giữ y nguyên, không ghi đè', () => {
    const custom = [1500, 4000, 7000];
    const out = shuffleAndExport(examPart1(choicesPara([tabRun, tabRun, tabRun], 'B', custom)));

    assert.deepStrictEqual(
      tabPositions(out), custom,
      'mốc tab của tác giả phải được tôn trọng nguyên vẹn'
    );
  });

  it('đề gốc ngăn bằng dấu cách: đổi sang tab thật để mốc có tác dụng', () => {
    const out = shuffleAndExport(examPart1(choicesPara([spaceRun, spaceRun, spaceRun])));

    assert.ok(out.includes('<w:tab/>'), 'dấu cách phải được thay bằng tab thật');
    assert.ok(tabPositions(out).length === 3, 'và kèm mốc tab chia 4');
  });

  it('giữ đủ 4 phương án sau khi căn lại', () => {
    const out = shuffleAndExport(examPart1(choicesPara([tabRun, brRun, tabRun])));
    for (const text of Object.values(OPTS)) {
      assert.ok(out.includes(escapeXml(text)), `mất phương án "${text}"`);
    }
  });
});
