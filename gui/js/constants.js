/**
 * Hằng số dùng chung cho giao diện.
 *
 * Đây là bản sao của src/config/roles.ts. Frontend chạy thẳng dưới dạng ES module,
 * không có bước build, nên không import được từ TypeScript phía máy chủ. Hai file phải
 * được sửa cùng nhau — nếu lệch, giao diện sẽ hiển thị sai gói của người dùng trong khi
 * máy chủ vẫn cấp quyền đúng (hoặc ngược lại).
 */

/**
 * Mọi trạng thái được tính là PRO. Ba giá trị cuối là di sản từ các phiên bản trước,
 * không còn được cấp mới nhưng vẫn phải được công nhận.
 */
export const PRO_STATUSES = ['6_months', '1_year', 'lifetime', 'pro', 'approved', 'active'];

/** Lưu ý: KHÔNG xét hạn dùng — bên gọi tự đối chiếu expireAt. */
export function isProStatus(status) {
    return !!status && PRO_STATUSES.includes(status);
}
