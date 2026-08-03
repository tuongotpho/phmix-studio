/**
 * Bộ dựng WordprocessingML tối giản cho test.
 *
 * Dùng chuỗi XML thay vì file .docx thật: chạy nhanh, diff đọc được, và không phải
 * đưa file nhị phân vào repo (gui/demau.docx hiện đã hỏng — central directory sai,
 * cả adm-zip lẫn System.IO.Compression đều không mở được).
 *
 * Chỉ dựng đúng những nút mà parser/engine thực sự đọc: w:p, w:r, w:t, w:rPr/w:u, w:tab.
 */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Một w:r chứa text. underline=true mô phỏng giáo viên gạch chân run đó. */
export function run(text: string, underline = false): string {
  const rPr = underline ? '<w:rPr><w:u w:val="single"/></w:rPr>' : '';
  return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

/** Run chỉ chứa tab — ký tự phân tách giữa các phương án trên cùng một dòng. */
export function tab(): string {
  return '<w:r><w:tab/></w:r>';
}

export function para(...children: string[]): string {
  return `<w:p><w:pPr/>${children.join('')}</w:p>`;
}

/** Đoạn văn bản thường (một run duy nhất). */
export function textPara(text: string, underline = false): string {
  return para(run(text, underline));
}

/**
 * Bốn phương án nằm trên CÙNG một đoạn, phân tách bằng tab (layout "single_para").
 * underlined: nhãn của phương án nào được gạch chân.
 */
export function choicesSinglePara(
  opts: Record<'A' | 'B' | 'C' | 'D', string>,
  underlined: Array<'A' | 'B' | 'C' | 'D'> = []
): string {
  const letters: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
  const parts: string[] = [];
  letters.forEach((letter, i) => {
    parts.push(run(`${letter}. ${opts[letter]}`, underlined.includes(letter)));
    if (i < 3) parts.push(tab());
  });
  return para(...parts);
}

/** Bốn phương án, mỗi phương án một đoạn riêng (layout "four_paras"). */
export function choicesFourParas(
  opts: Record<'A' | 'B' | 'C' | 'D', string>,
  underlined: Array<'A' | 'B' | 'C' | 'D'> = []
): string[] {
  const letters: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
  return letters.map(letter => para(run(`${letter}. ${opts[letter]}`, underlined.includes(letter))));
}

/**
 * Một phương án có nhãn KHÔNG gạch chân nhưng một từ trong nội dung thì có
 * — kiểu giáo viên gạch chân để nhấn mạnh, không phải để chọn đáp án.
 */
export function choiceParaWithEmphasis(letter: string, before: string, emphasised: string): string {
  return para(run(`${letter}. ${before}`, false), run(emphasised, true));
}

export function body(...blocks: string[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}">` +
    `<w:body>${blocks.join('')}<w:sectPr/></w:body>` +
    '</w:document>'
  );
}
