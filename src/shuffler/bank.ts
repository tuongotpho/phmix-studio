import AdmZip from 'adm-zip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { emptyTemplateBase64 } from './empty-template.js';
import { fetchMediaStrict } from '../services/media-fetch.js';
import { findChoiceStarts } from './parser.js';
import { isSeparatorElement } from './xml-utils.js';
import {
  getUsableWidthTwips,
  separatorHasBreak,
  hasExplicitTabStops,
  columnsFromBreaks,
  applyEvenTabStops,
  createSeparatorRun
} from './tab-layout.js';

/** Trần số ảnh tải từ xa cho mỗi lần tạo đề — chặn khuếch đại (500 câu × nhiều ảnh). */
const MAX_REMOTE_MEDIA = 100;

/**
 * Trần TỔNG dung lượng ảnh cho mỗi lần tạo đề.
 *
 * Chỉ đếm số ảnh là không đủ: MAX_REMOTE_MEDIA (100) nhân với MAX_MEDIA_BYTES của
 * media-fetch (8MB mỗi ảnh) cho trần lý thuyết 800MB, trong khi instance App Hosting
 * chỉ có 1GB (apphosting.yaml). Các buffer này KHÔNG được giải phóng dần — chúng nằm
 * lại trong `zip` cho tới lúc toBuffer(). Hai giới hạn kia được đặt ở hai file khác
 * nhau nên chưa ai nhân chúng với nhau; đây là chỗ chốt lại.
 *
 * 64MB khớp với trần giải nén của docx-archive.ts: một đề .docx hợp lệ nở ra tối đa
 * chừng đó, nên đề lắp từ ngân hàng cũng không có lý do vượt qua.
 */
const MAX_TOTAL_MEDIA_BYTES = 64 * 1024 * 1024;

/**
 * Căn thẳng hàng A/B/C/D cho đoạn phương án lấy từ rawXmls của Ngân hàng, GIỮ NGUYÊN
 * cách dàn của đề gốc.
 *
 * rawXmls là XML đoạn văn giữ nguyên từ file gốc lúc câu hỏi được nạp vào kho, nên
 * số phương án mỗi hàng và tab stop (nếu có) đều đo được ngay tại đây. Chỉ bổ sung
 * mốc tab khi đề gốc chưa khai báo — thiếu mốc thì Word dùng mặc định 720 twip và
 * các cột lệch nhau tuỳ độ dài chữ.
 *
 * Không tìm đủ cả 4 nhãn thì bỏ qua: đoạn đó không phải dòng phương án.
 */
function normalizeChoiceParagraph(p_elm: any, doc: any, usableWidth: number): void {
  const ln = p_elm.localName || p_elm.tagName?.split(':').pop();
  if (ln !== 'p') return;

  const chars = ['A', 'B', 'C', 'D'] as const;
  const starts = findChoiceStarts(p_elm);
  if (!chars.every(c => starts[c] > -1)) return;
  // Nhãn phải xuất hiện đúng thứ tự A→D trên cùng một đoạn thì mới cắt được segment.
  for (let i = 1; i < chars.length; i++) {
    if (starts[chars[i]] <= starts[chars[i - 1]]) return;
  }

  const children = Array.from(p_elm.childNodes);
  const head = children.slice(0, starts['A']);
  const segments: any[][] = chars.map((c, i) => {
    const to = i < 3 ? starts[chars[i + 1]] : children.length;
    return children.slice(starts[c], to);
  });

  // Tách separator ra khỏi đuôi từng phương án: chúng vừa là dữ liệu để đo lưới,
  // vừa được dựng lại bằng node mới (đề gốc hay ngăn bằng dấu cách, mà dấu cách
  // thì tab stop không có tác dụng).
  const separators: any[][] = segments.map(seg => {
    const seps: any[] = [];
    while (seg.length > 0) {
      const last = seg[seg.length - 1];
      if (last.nodeType === 1 && isSeparatorElement(last)) seps.unshift(seg.pop());
      else break;
    }
    return seps;
  });

  const breakAfter = separators.map(separatorHasBreak);
  const columns = columnsFromBreaks(breakAfter, 4);
  const keepOriginalTabs = hasExplicitTabStops(p_elm);

  children.forEach(child => p_elm.removeChild(child));
  head.forEach(node => p_elm.appendChild(node));
  segments.forEach((seg, i) => {
    seg.forEach(node => p_elm.appendChild(node));
    if (i < 3) p_elm.appendChild(createSeparatorRun(doc, i, breakAfter));
  });

  if (!keepOriginalTabs) {
    applyEvenTabStops(p_elm, doc, columns, usableWidth);
  }
}

/**
 * Dựng đề gốc (.docx) từ các câu hỏi trong ngân hàng.
 *
 * Trước đây hàm nhận thêm tham số `mode: 'student' | 'teacher' | 'base'`, nhưng cả hai
 * nơi gọi đều truyền 'base' — hai nhánh còn lại chưa từng chạy. Nhánh 'teacher' lại
 * mang sẵn một lỗi: nó đọc `q.correctAnswers[k].isCorrect`, trong khi correctAnswers do
 * exam.parse.ts sinh ra là Record<string, boolean>, nên `.isCorrect` luôn undefined và
 * MỌI mệnh đề sẽ được in là "S". Bỏ hẳn tham số thay vì để lại cái bẫy đó.
 *
 * Việc tách bản học sinh / bản giáo viên đã do exportShuffledXml đảm nhiệm ở khâu trộn
 * (xem src/services/shuffle-pipeline.ts), nên đây chỉ cần dựng đúng đề gốc.
 */
export async function generateBankExamDocxFromXml(
  title: string,
  code: string,
  p1Questions: any[],
  p2Questions: any[],
  p3Questions: any[]
): Promise<Buffer> {
  const zip = new AdmZip(Buffer.from(emptyTemplateBase64, 'base64'));
  const docXmlEntry = zip.getEntry('word/document.xml');
  const relsEntry = zip.getEntry('word/_rels/document.xml.rels');
  
  if (!docXmlEntry || !relsEntry) throw new Error("Template missing critical files");

  const docParser = new DOMParser();
  const docXml = docParser.parseFromString(docXmlEntry.getData().toString('utf-8'), 'text/xml');
  const relsXml = docParser.parseFromString(relsEntry.getData().toString('utf-8'), 'text/xml');
  
  const body = docXml.getElementsByTagName('w:body')[0];
  const relsEl = relsXml.getElementsByTagName('Relationships')[0];
  const xmlSerializer = new XMLSerializer();
  
  let relIdCounter = 1000;
  let remoteFetches = 0;
  let mediaBytesTotal = 0;
  const usableWidth = getUsableWidthTwips(docXml);

  function appendHeader(text: string, isBold: boolean = true) {
    const p = docXml.createElement('w:p');
    const pPr = docXml.createElement('w:pPr');
    const jc = docXml.createElement('w:jc');
    jc.setAttribute('w:val', 'center');
    pPr.appendChild(jc);
    p.appendChild(pPr);
    const r = docXml.createElement('w:r');
    if (isBold) {
      const rPr = docXml.createElement('w:rPr');
      const b = docXml.createElement('w:b');
      rPr.appendChild(b);
      r.appendChild(rPr);
    }
    const t = docXml.createElement('w:t');
    t.textContent = text;
    r.appendChild(t);
    p.appendChild(r);
    body.appendChild(p);
  }

  function appendPartHeader(text: string) {
    const p = docXml.createElement('w:p');
    const pPr = docXml.createElement('w:pPr');
    const spacing = docXml.createElement('w:spacing');
    spacing.setAttribute('w:before', '240');
    spacing.setAttribute('w:after', '120');
    pPr.appendChild(spacing);
    p.appendChild(pPr);
    const r = docXml.createElement('w:r');
    const rPr = docXml.createElement('w:rPr');
    const b = docXml.createElement('w:b');
    rPr.appendChild(b);
    r.appendChild(rPr);
    const t = docXml.createElement('w:t');
    t.textContent = text;
    r.appendChild(t);
    p.appendChild(r);
    body.appendChild(p);
  }

  appendHeader(title.toUpperCase());
  appendHeader(`MÃ ĐỀ THI: ${code}`);

  const emptyP = docXml.createElement('w:p');
  body.appendChild(emptyP);

  const processQuestions = async (questions: any[]) => {
    for (let idx = 0; idx < questions.length; idx++) {
      const q = questions[idx];
      const qElements = q.rawXmls ? q.rawXmls.map((xml: string) => {
        try {
           return docParser.parseFromString(xml, 'text/xml').documentElement;
        } catch { return null; }
      }).filter(Boolean) : [];

      if (qElements.length === 0) {
         // Fallback: dựng lại câu hỏi từ văn bản thuần.
         // Trước đây dùng `return` — thoát cả vòng lặp, khiến MỌI câu còn lại của phần
         // này bị cắt khỏi đề mà không báo gì. Phải là `continue`: bỏ qua đúng một câu.
         const p = docXml.createElement('w:p');
         const r = docXml.createElement('w:r');
         const t = docXml.createElement('w:t');
         t.textContent = `Câu ${idx+1}: ${q.questionText || ''}`;
         r.appendChild(t);
         p.appendChild(r);
         body.appendChild(p);
         continue;
      }

      // Map media
      const oldToNewRelId: Record<string, string> = {};
      if (q.mediaItems) {
        for (const media of q.mediaItems) {
           if (!media.id || !media.target || (!media.base64 && !media.url)) continue;

           const newRelId = `rIdBank${relIdCounter++}`;
           const ext = media.target.split('.').pop() || 'png';
           let newTarget = ""; let relType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"; if (ext === "bin") { newTarget = `embeddings/bank_ole_${newRelId}.bin`; relType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject"; } else { newTarget = `media/bank_img_${newRelId}.${ext}`; }

           let data: Buffer | null = null;
           try {
             if (mediaBytesTotal >= MAX_TOTAL_MEDIA_BYTES) {
               console.warn(
                 `[BankShuffler] Bỏ qua ảnh: đã đạt trần tổng dung lượng ${MAX_TOTAL_MEDIA_BYTES} byte.`
               );
             } else if (media.base64) {
               const base64Data = media.base64.split(',').pop() || media.base64;
               data = Buffer.from(base64Data, 'base64');
             } else if (media.url) {
               if (remoteFetches >= MAX_REMOTE_MEDIA) {
                 console.warn(`[BankShuffler] Bỏ qua ảnh: đã đạt trần ${MAX_REMOTE_MEDIA} ảnh tải từ xa.`);
               } else {
                 remoteFetches++;
                 // fetchMediaStrict chặn host lạ, chuyển hướng, timeout và ảnh quá lớn.
                 data = await fetchMediaStrict(media.url);
               }
             }
           } catch (e: any) {
             console.error('[BankShuffler] Bỏ qua ảnh không tải được:', e?.message || e);
           }

           // Không đăng ký relationship khi thiếu dữ liệu: một Relationship trỏ tới file
           // không tồn tại làm Word báo tài liệu hỏng.
           if (!data) continue;

           // Cộng dồn SAU khi có dữ liệu thật: ảnh cuối cùng được phép vượt trần một
           // chút (tối đa 8MB của fetchMediaStrict), đổi lại phép đếm không phụ thuộc
           // vào Content-Length do bên ngoài khai.
           mediaBytesTotal += data.length;

           zip.addFile(`word/${newTarget}`, data);
           oldToNewRelId[media.id] = newRelId;

           const newRel = relsXml.createElement('Relationship');
           newRel.setAttribute('Id', newRelId);
           newRel.setAttribute('Type', relType);
           newRel.setAttribute('Target', newTarget);
           relsEl.appendChild(newRel);
        }
      }

      let foundFirstText = false;
      qElements.forEach((el: any) => {
        const traverse = (node: any) => {
          if (!node || !node.childNodes) return;
          if (node.nodeType === 1) { // Element
            const embed = node.getAttribute('r:embed');
            if (embed && oldToNewRelId[embed]) {
               node.setAttribute('r:embed', oldToNewRelId[embed]);
            }
            const embed2 = node.getAttribute('embed');
            if (embed2 && oldToNewRelId[embed2]) {
               node.setAttribute('embed', oldToNewRelId[embed2]);
            }
            const id = node.getAttribute('r:id');
            if (id && oldToNewRelId[id]) {
               node.setAttribute('r:id', oldToNewRelId[id]);
            }
            const id2 = node.getAttribute('id');
            if (id2 && oldToNewRelId[id2]) {
               node.setAttribute('id', oldToNewRelId[id2]);
            }
          }
          const children = Array.from(node.childNodes);
          for (const child of children) traverse(child);
        };
        traverse(el);
        
        
        const replaceQuestionNum = (node: any) => {
          if (!node || !node.childNodes) return;
          if (node.nodeType === 3) {
            const val = node.nodeValue || '';
            const match = val.match(/^\s*(Câu|Cau)\s*\d+([\.\:\s]+)/i);
            if (match && !foundFirstText) {
              node.nodeValue = val.replace(/^\s*(Câu|Cau)\s*\d+([\.\:\s]+)/i, `Câu ${idx + 1}$2`);
              foundFirstText = true;
            } else if (val.trim().length > 0 && !foundFirstText) {
              node.nodeValue = `Câu ${idx + 1}. ` + val.replace(/^\s+/, '');
              foundFirstText = true;
            }
          }
          const children = Array.from(node.childNodes || []);
          for (const child of children) replaceQuestionNum(child);
        };
        replaceQuestionNum(el);

        // Use cloneNode since xmldom cloneNode works across documents sometimes, or just importNode
        let importedNode;
        if (typeof docXml.importNode === 'function') {
           importedNode = docXml.importNode(el, true);
        } else {
           importedNode = el.cloneNode(true);
        }

        // Sau khi import để tab/br được tạo bằng chính docXml.
        normalizeChoiceParagraph(importedNode, docXml, usableWidth);

        body.appendChild(importedNode);
      });
    }
  };

  if (p1Questions.length > 0) {
    appendPartHeader("PHẦN I. Câu hỏi trắc nghiệm nhiều phương án lựa chọn (Thí sinh chọn 1 đáp án đúng)");
    await processQuestions(p1Questions);
  }
  if (p2Questions.length > 0) {
    appendPartHeader("PHẦN II. Câu hỏi đúng sai (Thí sinh chọn Đúng hoặc Sai cho mỗi ý a, b, c, d)");
    await processQuestions(p2Questions);
  }
  if (p3Questions.length > 0) {
    appendPartHeader("PHẦN III. Câu hỏi trả lời ngắn / Tự luận");
    await processQuestions(p3Questions);
  }

  zip.updateFile('word/document.xml', Buffer.from(xmlSerializer.serializeToString(docXml), 'utf-8'));
  zip.updateFile('word/_rels/document.xml.rels', Buffer.from(xmlSerializer.serializeToString(relsXml), 'utf-8'));

  return zip.toBuffer();
}
