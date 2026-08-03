import AdmZip from 'adm-zip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { emptyTemplateBase64 } from './emptyTemplate.js';
import { fetchMediaStrict } from './src/services/media-fetch.js';
import { findChoiceStarts } from './src/shuffler/parser.js';
import { isSeparatorElement } from './src/shuffler/xml-utils.js';
import {
  getUsableWidthTwips,
  chooseColumnCount,
  applyEvenTabStops,
  createSeparatorRun
} from './src/shuffler/tab-layout.js';

/** Trần số ảnh tải từ xa cho mỗi lần tạo đề — chặn khuếch đại (500 câu × nhiều ảnh). */
const MAX_REMOTE_MEDIA = 100;

/**
 * Căn đều A/B/C/D cho đoạn phương án lấy từ rawXmls của Ngân hàng.
 *
 * rawXmls là XML đoạn văn giữ nguyên từ file gốc lúc câu hỏi được nạp vào kho, nên
 * cách trình bày xấu của đề gốc theo vào đây. Dựng lại dấu phân cách bằng tab/br và
 * khai báo tab stop chia đều — nếu không, tab trong đề gốc sẽ dừng ở mốc mặc định
 * 720 twip và các cột lệch nhau tuỳ độ dài chữ.
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

  // Bỏ separator cũ ở đuôi từng phương án, chúng được dựng lại theo số cột.
  for (const seg of segments) {
    while (seg.length > 0) {
      const last = seg[seg.length - 1];
      if (last.nodeType === 1 && isSeparatorElement(last)) seg.pop();
      else break;
    }
  }

  const columns = chooseColumnCount(segments, usableWidth);

  children.forEach(child => p_elm.removeChild(child));
  head.forEach(node => p_elm.appendChild(node));
  segments.forEach((seg, i) => {
    seg.forEach(node => p_elm.appendChild(node));
    if (i < 3) p_elm.appendChild(createSeparatorRun(doc, i, columns));
  });

  applyEvenTabStops(p_elm, doc, columns, usableWidth);
}

export async function generateBankExamDocxFromXml(
  title: string,
  code: string,
  p1Questions: any[],
  p2Questions: any[],
  p3Questions: any[],
  mode: 'student' | 'teacher' | 'base'
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
  if (mode === 'teacher') {
    appendHeader("(BẢN GIÁO VIÊN - CÓ ĐÁP ÁN VÀ ĐÁP SỐ CHÍNH XÁC)", false);
  }
  
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
             if (media.base64) {
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
        
        if (mode === 'student') {
          const uTags = Array.from(el.getElementsByTagName('w:u'));
          uTags.forEach((u: any) => {
             if (u && u.parentNode) u.parentNode.removeChild(u);
          });
          const colors = Array.from(el.getElementsByTagName('w:color'));
          colors.forEach((c: any) => {
             if (c && c.parentNode) c.parentNode.removeChild(c);
          });
        }
        
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

      if (mode === 'teacher') {
         const p = docXml.createElement('w:p');
         const r = docXml.createElement('w:r');
         const rPr = docXml.createElement('w:rPr');
         const color = docXml.createElement('w:color');
         color.setAttribute('w:val', '008000');
         const b = docXml.createElement('w:b');
         rPr.appendChild(b);
         rPr.appendChild(color);
         r.appendChild(rPr);
         const t = docXml.createElement('w:t');
         let ansStr = '';
         if (q.part === 1) ansStr = q.correctLetter || q.correctAnswer || '';
         if (q.part === 2) {
            ansStr = Object.keys(q.correctAnswers || {}).map(k => `${k}: ${q.correctAnswers[k].isCorrect ? 'Đ' : 'S'}`).join(', ');
         }
         if (q.part === 3) ansStr = q.correctAnswer || '';
         t.textContent = `[Đáp án]: ${ansStr}`;
         r.appendChild(t);
         p.appendChild(r);
         body.appendChild(p);
      }
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
