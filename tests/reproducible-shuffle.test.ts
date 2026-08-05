import { describe, it } from 'node:test';
import assert from 'node:assert';
import AdmZip from 'adm-zip';
import { parseExam, examHasQuestions } from '../src/shuffler/index.js';
import {
  buildShuffledExamZip,
  buildSeedNote,
  SEED_NOTE_FILENAME
} from '../src/services/shuffle-pipeline.js';
import { body, textPara, choicesSinglePara } from './helpers/wordml.js';

/**
 * Cùng một seed phải cho ra đúng bộ đề cũ; seed khác phải cho ra bộ đề khác.
 *
 * Trước đây pipeline luôn truyền seed = null và gọi shuffleExamData RIÊNG cho từng mã đề,
 * nên mỗi mã tự bốc một số nền — bộ đề không tái tạo được và tham số `code` vô nghĩa.
 */

/** Đề tối thiểu: 1 phần, 6 câu trắc nghiệm bốn phương án trên một dòng, đáp án đúng là A. */
function examXml(): string {
  const blocks: string[] = [textPara('PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn')];
  for (let i = 1; i <= 6; i++) {
    blocks.push(textPara(`Câu ${i}. Nội dung câu hỏi số ${i}`));
    blocks.push(
      choicesSinglePara(
        { A: `dap an A cau ${i}`, B: `dap an B cau ${i}`, C: `dap an C cau ${i}`, D: `dap an D cau ${i}` },
        ['A']
      )
    );
  }
  return body(...blocks);
}

/** Gói .docx tối thiểu để pipeline có entry mà dựng lại. */
function baseEntries() {
  return [
    {
      entryName: '[Content_Types].xml',
      data: Buffer.from(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="xml" ContentType="application/xml"/></Types>',
        'utf-8'
      )
    },
    {
      entryName: 'word/_rels/document.xml.rels',
      data: Buffer.from(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
        'utf-8'
      )
    }
  ];
}

async function buildZip(seed: number | undefined, codes: number[]) {
  const xml = examXml();
  return buildShuffledExamZip({
    examData: parseExam(xml, {}),
    documentXmlText: xml,
    baseDocxEntries: baseEntries(),
    codes,
    flags: { shuffleQuestions: true, shuffleChoices: true, shuffleStatements: true },
    seed
  });
}

function studentDoc(zip: AdmZip, code: number): string {
  const entry = zip.getEntry(`De_HocSinh_${code}.docx`)!;
  return new AdmZip(entry.getData()).getEntry('word/document.xml')!.getData().toString('utf-8');
}

describe('Tái tạo bộ đề bằng seed', () => {
  it('cùng seed cho ra bộ đề giống hệt', async () => {
    const a = await buildZip(12345, [101, 102]);
    const b = await buildZip(12345, [101, 102]);

    assert.strictEqual(studentDoc(a, 101), studentDoc(b, 101), 'mã 101 phải trùng khớp');
    assert.strictEqual(studentDoc(a, 102), studentDoc(b, 102), 'mã 102 phải trùng khớp');
  });

  it('seed khác cho ra bộ đề khác', async () => {
    const a = await buildZip(12345, [101]);
    const b = await buildZip(999, [101]);

    assert.notStrictEqual(studentDoc(a, 101), studentDoc(b, 101), 'seed khác phải trộn khác');
  });

  it('các mã đề trong cùng một bộ khác nhau', async () => {
    const zip = await buildZip(12345, [101, 102]);

    assert.notStrictEqual(
      studentDoc(zip, 101),
      studentDoc(zip, 102),
      'hai mã đề cùng bộ mà giống nhau thì học sinh ngồi cạnh có cùng đáp án'
    );
  });

  it('không truyền seed thì mỗi lần trộn ra một bộ khác', async () => {
    const a = await buildZip(undefined, [101]);
    const b = await buildZip(undefined, [101]);

    assert.notStrictEqual(studentDoc(a, 101), studentDoc(b, 101));
  });

  it('zip kèm tệp ghi mã tái tạo', async () => {
    const zip = await buildZip(24680, [101, 102]);
    const note = zip.getEntry(SEED_NOTE_FILENAME);

    assert.ok(note, `thiếu ${SEED_NOTE_FILENAME} — mất tệp là mất luôn bộ đề`);
    const text = note!.getData().toString('utf-8');
    assert.ok(text.includes('24680'), 'ghi chú phải chứa mã tái tạo');
    assert.ok(text.includes('101'), 'ghi chú phải chứa mã đề bắt đầu');
  });

  it('ghi chú nêu đủ các tuỳ chọn đã dùng', () => {
    const note = buildSeedNote(7, [201, 202], {
      shuffleQuestions: true,
      shuffleChoices: false,
      shuffleStatements: true
    });

    assert.ok(note.includes('Trộn phương án    : không'), 'phải ghi rõ tuỳ chọn đã tắt');
    assert.ok(note.includes('Số mã đề          : 2'));
  });
});

describe('Phát hiện đề không nhận ra câu hỏi nào', () => {
  it('đề thiếu tiêu đề PHẦN bị coi là rỗng và có cảnh báo', () => {
    const xml = body(
      textPara('Phần 1. Trac nghiem'),
      textPara('Câu 1. Noi dung'),
      choicesSinglePara({ A: 'mot', B: 'hai', C: 'ba', D: 'bon' }, ['A'])
    );
    const data = parseExam(xml, {});

    assert.strictEqual(examHasQuestions(data), false, '"Phần 1" số Ả Rập không được nhận');
    assert.ok(
      data.warnings.some(w => w.includes('PHẦN I')),
      'phải có cảnh báo chỉ rõ cách ghi tiêu đề đúng'
    );
  });

  it('đề có tiêu đề PHẦN nhưng không có câu nào cũng bị bắt', () => {
    const data = parseExam(body(textPara('PHẦN I. Trac nghiem') + textPara('Ghi chu linh tinh')), {});

    assert.strictEqual(examHasQuestions(data), false);
    assert.ok(data.warnings.some(w => w.includes('Câu')), 'phải nhắc định dạng "Câu <số>."');
  });

  it('đề đúng định dạng thì không báo rỗng', () => {
    const data = parseExam(examXml(), {});

    assert.strictEqual(examHasQuestions(data), true);
    assert.strictEqual(data.parts[1].length, 6);
  });
});
