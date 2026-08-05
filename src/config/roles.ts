/**
 * Trạng thái tài khoản — nguồn duy nhất cho cả khâu xét quyền lẫn API quản trị.
 *
 * Trước đây danh sách này được viết lại ở bốn nơi và KHÔNG khớp nhau: getUserRole()
 * chấp nhận 6 giá trị, còn VALID_PACKAGES của trang quản trị chỉ có 4. Hệ quả là
 * 'pro' / 'approved' / 'active' vẫn được tính là PRO nhưng không còn đường nào tạo ra
 * chúng — chúng chỉ tồn tại trên các hồ sơ lập từ những phiên bản cũ.
 *
 * Giữ nguyên cả 6 giá trị để không cắt quyền của người dùng cũ đang trả tiền. Muốn dọn
 * hẳn thì phải chạy một lượt chuẩn hoá dữ liệu Firestore trước, đưa 3 giá trị di sản về
 * 'lifetime', rồi mới rút gọn danh sách ở đây.
 *
 * Bản sao cho phía trình duyệt nằm ở gui/js/constants.js — frontend không có bước build
 * nên không import trực tiếp được từ TypeScript. Sửa ở đây thì sửa luôn bên đó.
 */

/** Gói mà trang quản trị cấp được. 'pending' nghĩa là thu hồi về trạng thái chờ duyệt. */
export const ASSIGNABLE_PACKAGES = ['6_months', '1_year', 'lifetime', 'pending'] as const;

export type AssignablePackage = (typeof ASSIGNABLE_PACKAGES)[number];

/**
 * Mọi trạng thái được tính là PRO.
 *
 * Ba giá trị cuối là di sản: 'pro' và 'approved' có từ thời chưa chia gói theo thời hạn,
 * 'active' đến từ một đợt nhập dữ liệu tay. Chúng không còn được cấp mới (xem
 * ASSIGNABLE_PACKAGES) nhưng vẫn phải được công nhận.
 */
export const PRO_STATUSES = ['6_months', '1_year', 'lifetime', 'pro', 'approved', 'active'] as const;

/** Lưu ý: KHÔNG xét hạn dùng — bên gọi tự đối chiếu expireAt. */
export function isProStatus(status: string | undefined | null): boolean {
  return !!status && (PRO_STATUSES as readonly string[]).includes(status);
}
