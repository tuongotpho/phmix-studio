/**
 * Căn đều các phương án A/B/C/D bằng tab stop của WordprocessingML.
 *
 * Các phương án trên cùng một dòng vốn được nối bằng ký tự tab, nhưng nếu đoạn văn
 * không khai báo `w:tabs` thì Word rơi về tab mặc định mỗi 720 twip. Khi đó vị trí
 * nhảy của tab phụ thuộc độ dài chữ đứng trước nó, nên mỗi câu hỏi lại lệch một kiểu.
 * Khai báo tab stop chia đều bề rộng trang là cách Word dùng để dựng cột thẳng hàng.
 *
 * Chỉ tác động trong phạm vi MỘT đoạn văn: xuống cột dùng `w:br` chứ không tách đoạn,
 * nên không làm xê dịch chỉ số đoạn mà engine đang giữ trong para_indices.
 */

import { getElementsByTagNameLocal, getNodeText } from './xml-utils.js';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** A4 dọc, lề 2.54cm — dùng khi tài liệu không khai báo sectPr hợp lệ. */
const FALLBACK_PAGE_WIDTH = 11906;
const FALLBACK_MARGIN = 1440;

/**
 * Bề rộng trung bình một ký tự Times New Roman 12pt, tính theo twip.
 * 1pt = 20 twip nên cỡ chữ 12pt có em rộng 240 twip; chữ thường chiếm khoảng nửa em.
 * Đây là ước lượng — không có font metrics ở phía máy chủ — nên các ngưỡng bên dưới
 * cố ý chọn dư một chút để thà xuống ít cột còn hơn tràn dòng.
 */
const AVG_CHAR_TWIPS = 120;

/** Chừa mép để chữ của cột này không dính sát cột kế bên. */
const COLUMN_PADDING_TWIPS = 140;

function toInt(value: string | null | undefined, fallback: number): number {
  const n = parseInt(value || '', 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Bề rộng vùng chữ của trang, đọc từ sectPr cuối cùng của tài liệu.
 * Đề người dùng tải lên có thể dùng khổ hoặc lề khác A4 nên không hardcode.
 */
export function getUsableWidthTwips(doc: any): number {
  const fallback = FALLBACK_PAGE_WIDTH - FALLBACK_MARGIN * 2;
  const sections = getElementsByTagNameLocal(doc, 'sectPr');
  const sect = sections[sections.length - 1];
  if (!sect) return fallback;

  const pgSz = getElementsByTagNameLocal(sect, 'pgSz')[0];
  const pgMar = getElementsByTagNameLocal(sect, 'pgMar')[0];

  const width = toInt(pgSz?.getAttribute('w:w'), FALLBACK_PAGE_WIDTH);
  const left = toInt(pgMar?.getAttribute('w:left'), FALLBACK_MARGIN);
  const right = toInt(pgMar?.getAttribute('w:right'), FALLBACK_MARGIN);

  const usable = width - left - right;
  // Lề âm hoặc sectPr rác sẽ cho ra số vô lý; thà quay về A4 còn hơn dựng tab stop sai.
  return usable > 1000 ? usable : fallback;
}

/**
 * Phương án chứa ảnh, OLE hay công thức toán thì độ dài chữ không phản ánh bề rộng
 * thật. Gặp trường hợp này thì không ép nhiều cột.
 */
function hasNonTextContent(nodes: any[]): boolean {
  for (const node of nodes) {
    if (!node || node.nodeType !== 1) continue;
    for (const tag of ['drawing', 'pict', 'object', 'oMath', 'oMathPara']) {
      if (getElementsByTagNameLocal(node, tag).length > 0) return true;
    }
  }
  return false;
}

/**
 * Chọn số cột dựa trên phương án DÀI NHẤT — cột chỉ thẳng hàng khi mọi phương án
 * đều lọt vào bề rộng cột.
 *
 * @param optionNodes mỗi phần tử là dãy node của một phương án
 * @param maxColumns  trần số cột (layout hai đoạn chỉ chứa 2 phương án mỗi đoạn)
 */
export function chooseColumnCount(
  optionNodes: any[][],
  usableWidth: number,
  maxColumns: number = 4
): number {
  if (optionNodes.length === 0) return 1;
  if (hasNonTextContent(optionNodes.flat())) return 1;

  let longest = 0;
  for (const nodes of optionNodes) {
    const text = nodes.map(n => getNodeText(n)).join('').trim();
    if (text.length > longest) longest = text.length;
  }

  for (const columns of [4, 2]) {
    if (columns > maxColumns) continue;
    const columnWidth = usableWidth / columns - COLUMN_PADDING_TWIPS;
    if (longest * AVG_CHAR_TWIPS <= columnWidth) return columns;
  }
  return 1;
}

function findOrCreatePPr(p_elm: any, doc: any): any {
  const children = p_elm.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child && child.nodeType === 1) {
      const ln = child.localName || child.tagName.split(':').pop();
      if (ln === 'pPr') return child;
    }
  }
  const pPr = doc.createElementNS(W_NS, 'w:pPr');
  // pPr bắt buộc là phần tử con ĐẦU TIÊN của w:p, nếu không Word báo file hỏng.
  p_elm.insertBefore(pPr, p_elm.firstChild);
  return pPr;
}

/**
 * Ghi các mốc tab chia đều vào pPr của đoạn. Tab stop cũ bị thay hẳn: giữ lại sẽ
 * khiến ký tự tab dừng ở mốc của đề gốc thay vì mốc mới.
 */
export function applyEvenTabStops(p_elm: any, doc: any, columns: number, usableWidth: number): void {
  const pPr = findOrCreatePPr(p_elm, doc);

  for (const old of getElementsByTagNameLocal(pPr, 'tabs')) {
    old.parentNode?.removeChild(old);
  }
  if (columns < 2) return;

  const tabs = doc.createElementNS(W_NS, 'w:tabs');
  const step = usableWidth / columns;
  for (let i = 1; i < columns; i++) {
    const tab = doc.createElementNS(W_NS, 'w:tab');
    tab.setAttribute('w:val', 'left');
    tab.setAttribute('w:pos', String(Math.round(step * i)));
    tabs.appendChild(tab);
  }
  // w:tabs phải đứng trước w:spacing/w:jc theo thứ tự schema của CT_PPr; chèn đầu
  // pPr là vị trí hợp lệ duy nhất không cần dò cả thứ tự các thẻ còn lại.
  pPr.insertBefore(tabs, pPr.firstChild);
}

export function createTabRun(doc: any): any {
  const r = doc.createElementNS(W_NS, 'w:r');
  r.appendChild(doc.createElementNS(W_NS, 'w:tab'));
  return r;
}

export function createBreakRun(doc: any): any {
  const r = doc.createElementNS(W_NS, 'w:r');
  r.appendChild(doc.createElementNS(W_NS, 'w:br'));
  return r;
}

/**
 * Dấu phân cách đặt SAU phương án thứ `index` (0-based).
 *
 * Hết một hàng thì xuống dòng bằng w:br, còn lại dùng tab để nhảy sang cột kế tiếp.
 * Luôn trả về tab/br mới thay vì giữ separator của đề gốc: đề gốc thường ngăn cách
 * bằng dấu cách, mà dấu cách thì tab stop không có tác dụng gì.
 */
export function createSeparatorRun(doc: any, index: number, columns: number): any {
  const endOfRow = columns >= 2 && (index + 1) % columns === 0;
  return endOfRow || columns < 2 ? createBreakRun(doc) : createTabRun(doc);
}
