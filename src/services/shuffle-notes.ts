import type { ExamData, Question } from '../shuffler/types.js';

/**
 * Ghi chú kèm bộ đề khi có câu KHÔNG trộn được.
 *
 * Khi parser không nhận ra cấu trúc phương án của một câu, engine bỏ qua khâu trộn
 * cho riêng câu đó: nó vẫn nằm trong đề nhưng giữ nguyên thứ tự A/B/C/D ở MỌI mã đề,
 * và ô đáp án của nó trong bảng tổng hợp để trống. Trước đây chuyện này diễn ra
 * hoàn toàn im lặng — /api/shuffle không trả `warnings` về client (chỉ /api/validate
 * trả), mà giáo viên thì thường bấm trộn thẳng. Hậu quả: hai học sinh ngồi cạnh nhau
 * có cùng đáp án ở những câu đó, không ai biết cho tới lúc chấm.
 *
 * Zip là tệp nhị phân nên không chèn cảnh báo vào phần thân HTTP được; đặt ghi chú
 * ngay trong zip là chỗ chắc chắn người dùng nhìn thấy. Cùng cách với
 * LUU_Y_THIEU_MA_QR.txt.
 *
 * Cố ý KHÔNG chặn việc trộn: bộ đề vẫn dùng được, giáo viên chỉ cần biết câu nào có
 * vấn đề để sửa tệp gốc.
 */

const PART_NAMES: Record<number, string> = {
  1: 'Phần I (trắc nghiệm nhiều phương án)',
  2: 'Phần II (đúng/sai)',
  3: 'Phần III (trả lời ngắn)'
};

/** Lý do một câu bị bỏ qua khâu trộn, hoặc null nếu câu đó bình thường. */
function skipReason(q: Question): string | null {
  if (q.part === 1 && !q.choices_info) {
    return 'không nhận ra đủ 4 phương án A/B/C/D';
  }
  if (q.part === 2 && !q.statements_info) {
    return 'không nhận ra đủ 4 mệnh đề a/b/c/d';
  }
  if (q.part === 3 && !q.short_answer_info) {
    return 'không tìm thấy dòng khai báo đáp án (ví dụ "Đáp án: 12")';
  }
  return null;
}

/**
 * Trả về nội dung tệp ghi chú, hoặc null khi mọi câu đều trộn được.
 * Bên gọi tự quyết định có thêm vào zip hay không.
 */
export function buildShuffleNote(examData: ExamData): string | null {
  const problems: { part: number; number: number; reason: string }[] = [];

  for (const part of [1, 2, 3]) {
    for (const q of examData.parts[part] || []) {
      const reason = skipReason(q);
      if (reason) problems.push({ part, number: q.number, reason });
    }
  }

  if (problems.length === 0) return null;

  const lines = [
    'LƯU Ý: MỘT SỐ CÂU KHÔNG TRỘN ĐƯỢC',
    '',
    `Có ${problems.length} câu mà máy không đọc được cấu trúc. Những câu này VẪN NẰM`,
    'trong đề, nhưng:',
    '',
    '  - thứ tự phương án GIỮ NGUYÊN ở tất cả các mã đề (học sinh ngồi cạnh nhau sẽ',
    '    có cùng đáp án ở những câu này),',
    '  - ô đáp án tương ứng trong bảng tổng hợp và tệp Excel để trống.',
    '',
    'Danh sách:',
    ''
  ];

  for (const p of problems) {
    lines.push(`  * ${PART_NAMES[p.part]} — Câu ${p.number}: ${p.reason}`);
  }

  lines.push(
    '',
    'Nguyên nhân thường gặp:',
    '',
    '  - nhãn phương án bị gõ trùng hoặc gõ sai (ví dụ bốn phương án là A, B, C, A),',
    '  - thiếu hẳn một phương án,',
    '  - nội dung một phương án bị ngắt xuống đoạn dưới (nhấn Enter giữa chừng),',
    '  - trộn kiểu trình bày trong cùng một câu (vừa xuống dòng vừa dùng tab).',
    '',
    'Cách xử lý: sửa các câu trên trong tệp .docx gốc rồi trộn lại. Nên dùng chức năng',
    'kiểm tra đề trước khi trộn để soát toàn bộ tệp một lượt.',
    '',
    'Phần còn lại của bộ đề không bị ảnh hưởng và dùng được bình thường.'
  );

  return lines.join('\n');
}

/** Tên tệp ghi chú đặt trong zip kết quả. */
export const SHUFFLE_NOTE_FILENAME = 'LUU_Y_CAU_KHONG_TRON_DUOC.txt';
