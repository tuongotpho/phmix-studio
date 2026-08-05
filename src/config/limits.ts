/**
 * Trần số mã đề cho mỗi lần trộn.
 *
 * Đặt ở đây vì cả /api/shuffle lẫn /api/shuffle-bank đều phải dùng CÙNG một con số —
 * trước đây mỗi nơi tự khai 100 và giao diện tự khai max="100", sửa một chỗ là lệch.
 *
 * Vì sao là 24 (đo trên gui/demau_1.docx, đề 0,19MB — 28 câu, 11 ảnh):
 *
 *   mã đề │ zip trả về │ thời gian │ ghi chú
 *      24 │   8,70 MB  │    26s    │ ✅ mức đang chọn
 *      48 │  17,39 MB  │    49s    │ sát timeout 60s của Firebase Hosting
 *      66 │      —     │     —     │ QR chấm điểm gộp vượt sức chứa, biến mất im lặng
 *     100 │  36,18 MB  │   102s    │ vượt trần response 32MiB của Cloud Run
 *
 * Ba cái trần đó (thời gian, sức chứa QR, dung lượng response) đều nằm trên 24 nên
 * mức này an toàn cho cả ba. Muốn nâng lên thì phải xử lý `exportShuffledXml` trước —
 * nó chiếm 94% thời gian, ~1 giây cho mỗi mã đề.
 *
 * Giới hạn của HTML (`max` trong gui/index.html) chỉ là gợi ý cho trình duyệt; chốt
 * chặn thật là ở đây, vì client gửi thẳng num_codes qua FormData.
 */
export const MAX_CODES_PER_REQUEST = 24;
