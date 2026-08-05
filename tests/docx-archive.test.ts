import { describe, it } from 'node:test';
import assert from 'node:assert';
import AdmZip from 'adm-zip';
import {
  checkArchiveLimits,
  MAX_UNCOMPRESSED_BYTES,
  MAX_ENTRIES
} from '../src/services/docx-archive.js';

/** Đóng gói rồi đọc lại: header.size chỉ có giá trị khi đọc từ central directory. */
function reopen(zip: AdmZip): AdmZip {
  return new AdmZip(zip.toBuffer());
}

describe('docx-archive — chặn zip bomb trên .docx tải lên', () => {
  it('cho qua một .docx bình thường', () => {
    const zip = new AdmZip();
    zip.addFile('word/document.xml', Buffer.from('<w:document/>', 'utf-8'));
    zip.addFile('word/media/image1.png', Buffer.alloc(64 * 1024, 7));

    assert.strictEqual(checkArchiveLimits(reopen(zip)), null);
  });

  it('chặn tệp nén nhỏ nhưng nở quá giới hạn sau giải nén', () => {
    // Toàn số 0 nén xuống còn vài KB — đúng hình dạng của một zip bomb: qua được
    // giới hạn upload 15MB của multer, rồi mới nở ra trong RAM.
    const zip = new AdmZip();
    zip.addFile('word/document.xml', Buffer.alloc(MAX_UNCOMPRESSED_BYTES + 1024));
    const packed = zip.toBuffer();

    assert.ok(packed.length < 1024 * 1024, `zip nén phải nhỏ, đang là ${packed.length} byte`);

    const msg = checkArchiveLimits(new AdmZip(packed));
    assert.ok(msg, 'phải bị từ chối');
    assert.match(msg!, /sau giải nén/);
  });

  it('chặn tệp có quá nhiều entry', () => {
    const zip = new AdmZip();
    for (let i = 0; i <= MAX_ENTRIES; i++) {
      zip.addFile(`word/media/f${i}.png`, Buffer.from('x'));
    }

    const msg = checkArchiveLimits(reopen(zip));
    assert.ok(msg, 'phải bị từ chối');
    assert.match(msg!, /quá nhiều thành phần/);
  });

  it('cộng dồn qua nhiều entry, không chỉ xét từng entry riêng lẻ', () => {
    const zip = new AdmZip();
    const chunk = Math.floor(MAX_UNCOMPRESSED_BYTES / 4);
    for (let i = 0; i < 5; i++) {
      zip.addFile(`word/media/img${i}.bin`, Buffer.alloc(chunk));
    }

    assert.ok(checkArchiveLimits(reopen(zip)), 'tổng 5 phần vượt giới hạn nên phải bị từ chối');
  });
});
