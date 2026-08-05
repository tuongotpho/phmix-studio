import { describe, it } from 'node:test';
import assert from 'node:assert';
import AdmZip from 'adm-zip';
import { generateBankExamDocxFromXml } from '../src/shuffler/bank.js';
import { isAllowedMediaUrl, fetchMediaStrict } from '../src/services/media-fetch.js';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Một đoạn WordprocessingML độc lập, dùng làm rawXmls của câu hỏi trong ngân hàng. */
function rawPara(text: string): string {
  return `<w:p xmlns:w="${W_NS}"><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function docXmlOf(buffer: Buffer): string {
  return new AdmZip(buffer).getEntry('word/document.xml')!.getData().toString('utf-8');
}

function relsOf(buffer: Buffer): string {
  return new AdmZip(buffer).getEntry('word/_rels/document.xml.rels')!.getData().toString('utf-8');
}

describe('media-fetch — chặn SSRF qua mediaItems[].url', () => {
  it('từ chối host nội bộ và địa chỉ IP', () => {
    const blocked = [
      'http://10.0.0.5:8080/internal',
      'https://10.0.0.5/internal',
      'http://169.254.169.254/computeMetadata/v1/',
      'https://127.0.0.1:3000/admin',
      'http://localhost/',
      'https://ke-tan-cong.example.com/thu-thap',
      'file:///etc/passwd',
      'gopher://127.0.0.1:11211/'
    ];
    for (const url of blocked) {
      assert.strictEqual(isAllowedMediaUrl(url), false, `phải chặn: ${url}`);
    }
  });

  it('từ chối http ngay cả khi host hợp lệ', () => {
    assert.strictEqual(isAllowedMediaUrl('http://firebasestorage.googleapis.com/v0/b/x/o/y'), false);
  });

  it('chấp nhận URL Firebase Storage thật', () => {
    assert.ok(isAllowedMediaUrl('https://firebasestorage.googleapis.com/v0/b/phmix-studio.firebasestorage.app/o/users%2Fabc%2Fimages%2F1.png?alt=media&token=xyz'));
    assert.ok(isAllowedMediaUrl('https://storage.googleapis.com/phmix-studio/anh.png'));
    assert.ok(isAllowedMediaUrl('https://phmix-studio.firebasestorage.app/anh.png'));
  });

  it('từ chối giá trị rác mà không ném lỗi', () => {
    for (const bad of [undefined, null, '', 42, {}, 'khong-phai-url']) {
      assert.strictEqual(isAllowedMediaUrl(bad as any), false);
    }
  });

  it('fetchMediaStrict chặn URL cấm TRƯỚC khi phát sinh kết nối', async () => {
    await assert.rejects(
      () => fetchMediaStrict('http://10.0.0.5:8080/internal'),
      /không nằm trong danh sách cho phép/
    );
  });
});

describe('generateBankExamDocxFromXml', () => {
  it('một câu hỏi thiếu rawXmls không được cắt mất các câu phía sau', async () => {
    const questions = [
      { questionText: 'CAU_HONG_KHONG_CO_XML', rawXmls: [] },
      { questionText: 'x', rawXmls: [rawPara('CAU_THU_HAI')] },
      { questionText: 'y', rawXmls: [rawPara('CAU_THU_BA')] }
    ];

    const xml = docXmlOf(await generateBankExamDocxFromXml('Đề test', '', questions, [], []));

    assert.ok(xml.includes('CAU_HONG_KHONG_CO_XML'), 'câu hỏng phải có đoạn dự phòng');
    assert.ok(xml.includes('CAU_THU_HAI'), 'câu số 2 bị cắt mất');
    assert.ok(xml.includes('CAU_THU_BA'), 'câu số 3 bị cắt mất');
  });

  it('ảnh có URL bị cấm bị bỏ qua, không để lại relationship treo', async () => {
    const questions = [{
      questionText: 'x',
      rawXmls: [rawPara('CAU_CO_ANH')],
      mediaItems: [{ id: 'rId1', target: 'anh.png', url: 'http://10.0.0.5:8080/internal' }]
    }];

    const buffer = await generateBankExamDocxFromXml('Đề test', '', questions, [], []);

    assert.ok(docXmlOf(buffer).includes('CAU_CO_ANH'), 'câu hỏi vẫn phải được xuất');
    assert.ok(
      !relsOf(buffer).includes('rIdBank'),
      'không được đăng ký relationship cho ảnh không tải được — Word sẽ báo tài liệu hỏng'
    );
  });

  it('ảnh base64 nhúng sẵn vẫn hoạt động bình thường', async () => {
    // PNG 1x1 trong suốt
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const questions = [{
      questionText: 'x',
      rawXmls: [rawPara('CAU_CO_ANH_BASE64')],
      mediaItems: [{ id: 'rId1', target: 'anh.png', base64: `data:image/png;base64,${png}` }]
    }];

    const buffer = await generateBankExamDocxFromXml('Đề test', '', questions, [], []);
    const zip = new AdmZip(buffer);

    assert.ok(relsOf(buffer).includes('rIdBank'), 'ảnh hợp lệ phải được đăng ký relationship');
    assert.ok(
      zip.getEntries().some(e => e.entryName.startsWith('word/media/bank_img_')),
      'file ảnh phải nằm trong gói docx'
    );
  });
});
