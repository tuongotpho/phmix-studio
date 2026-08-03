/**
 * Giữ nguyên cách dàn phương án A/B/C/D của đề gốc khi trộn.
 *
 * Nguyên tắc: đề trộn phải trông giống đề đã tải lên. Cách dàn được ĐO từ chính
 * tài liệu gốc chứ không do máy chủ tự quyết:
 *
 *   1. Đề gốc đã khai báo tab stop (`w:tabs`) → giữ y nguyên, không đụng vào.
 *   2. Chưa khai báo → đếm số phương án trên mỗi hàng qua vị trí ngắt dòng, rồi
 *      dựng mốc tab chia đều đúng số cột đó.
 *
 * Bước 2 là phần sửa lỗi: khi không có `w:tabs`, Word rơi về mốc mặc định 720 twip
 * nên điểm nhảy của tab phụ thuộc độ dài chữ đứng trước — mỗi câu lệch một kiểu.
 * Bổ sung mốc chia đều giữ đúng bố cục tác giả đã chọn, chỉ làm nó thẳng hàng.
 *
 * Chỉ tác động trong phạm vi MỘT đoạn văn: xuống hàng dùng `w:br` chứ không tách
 * đoạn, nên không làm xê dịch chỉ số đoạn mà engine giữ trong para_indices.
 */

import { getElementsByTagNameLocal } from './xml-utils.js';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** A4 dọc, lề 2.54cm — dùng khi tài liệu không khai báo sectPr hợp lệ. */
const FALLBACK_PAGE_WIDTH = 11906;
const FALLBACK_MARGIN = 1440;

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
  // Lề âm hoặc sectPr rác sẽ cho ra số vô lý; thà quay về A4 còn hơn dựng mốc sai.
  return usable > 1000 ? usable : fallback;
}

/** Dấu phân cách của đề gốc có xuống dòng không (w:br hoặc w:cr). */
export function separatorHasBreak(separatorNodes: any[]): boolean {
  for (const node of separatorNodes || []) {
    if (!node || node.nodeType !== 1) continue;
    const ln = node.localName || node.tagName?.split(':').pop();
    if (ln === 'br' || ln === 'cr') return true;
    if (getElementsByTagNameLocal(node, 'br').length > 0) return true;
    if (getElementsByTagNameLocal(node, 'cr').length > 0) return true;
  }
  return false;
}

/** Đề gốc đã tự khai báo mốc tab thì tôn trọng, không ghi đè. */
export function hasExplicitTabStops(p_elm: any): boolean {
  if (!p_elm) return false;
  const pPr = findPPr(p_elm);
  if (!pPr) return false;
  for (const tabs of getElementsByTagNameLocal(pPr, 'tabs')) {
    if (getElementsByTagNameLocal(tabs, 'tab').length > 0) return true;
  }
  return false;
}

/**
 * Số phương án trên một hàng, suy ra từ vị trí đề gốc xuống dòng.
 *
 * @param breakAfter breakAfter[i] = đề gốc có ngắt dòng ngay sau phương án thứ i
 * @param total      tổng số phương án nằm trên đoạn đang xét
 *
 * Không có ngắt dòng nào nghĩa là tác giả xếp hết trên một hàng.
 */
export function columnsFromBreaks(breakAfter: boolean[], total: number): number {
  for (let i = 0; i < total - 1; i++) {
    if (breakAfter[i]) return i + 1;
  }
  return total;
}

function findPPr(p_elm: any): any {
  const children = p_elm.childNodes;
  if (!children) return null;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child && child.nodeType === 1) {
      const ln = child.localName || child.tagName.split(':').pop();
      if (ln === 'pPr') return child;
    }
  }
  return null;
}

function findOrCreatePPr(p_elm: any, doc: any): any {
  const existing = findPPr(p_elm);
  if (existing) return existing;
  const pPr = doc.createElementNS(W_NS, 'w:pPr');
  // pPr bắt buộc là phần tử con ĐẦU TIÊN của w:p, nếu không Word báo file hỏng.
  p_elm.insertBefore(pPr, p_elm.firstChild);
  return pPr;
}

/**
 * Bổ sung mốc tab chia đều cho đoạn CHƯA có tab stop riêng.
 *
 * Gọi hàm này sau khi đã kiểm tra hasExplicitTabStops: đề gốc tự đặt mốc thì giữ
 * nguyên mốc đó mới đúng tinh thần "trộn xong vẫn giống đề tải lên".
 */
export function applyEvenTabStops(p_elm: any, doc: any, columns: number, usableWidth: number): void {
  if (columns < 2) return;

  const pPr = findOrCreatePPr(p_elm, doc);
  const tabs = doc.createElementNS(W_NS, 'w:tabs');
  const step = usableWidth / columns;
  for (let i = 1; i < columns; i++) {
    const tab = doc.createElementNS(W_NS, 'w:tab');
    tab.setAttribute('w:val', 'left');
    tab.setAttribute('w:pos', String(Math.round(step * i)));
    tabs.appendChild(tab);
  }
  // w:tabs phải đứng trước w:spacing/w:jc theo thứ tự schema của CT_PPr; chèn đầu
  // pPr là vị trí hợp lệ duy nhất không cần dò thứ tự các thẻ còn lại.
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
 * Dấu phân cách đặt SAU phương án ở vị trí `index`.
 *
 * Bám theo lưới của đề gốc: chỗ nào đề gốc xuống dòng thì vẫn xuống dòng, còn lại
 * dùng tab. Luôn dựng node mới thay vì tái sử dụng separator cũ, vì đề gốc rất hay
 * ngăn cách bằng dấu cách — mà dấu cách thì tab stop không có tác dụng gì.
 */
export function createSeparatorRun(doc: any, index: number, breakAfter: boolean[]): any {
  return breakAfter[index] ? createBreakRun(doc) : createTabRun(doc);
}
