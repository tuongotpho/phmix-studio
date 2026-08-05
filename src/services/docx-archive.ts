import type AdmZip from 'adm-zip';

/**
 * Chặn zip bomb trong .docx do người dùng tải lên.
 *
 * multer giới hạn 15MB, nhưng đó là kích thước ĐÃ NÉN. XML nén được ~10:1, nên một
 * tệp hợp lệ về mặt giới hạn upload vẫn có thể giải nén thành hàng GB — trong khi
 * exam.parse.ts base64 toàn bộ word/media/ và giữ hết trong RAM cùng lúc. Instance
 * App Hosting chỉ có 1GB và phục vụ 20 request song song, còn ba endpoint nhận .docx
 * đều KHÔNG yêu cầu đăng nhập, nên đây là đường làm cạn bộ nhớ rẻ nhất.
 *
 * Kiểm tra đọc từ central directory (getEntries() không giải nén), nên tốn gần như
 * không đáng kể và chạy được TRƯỚC mọi lời gọi getData().
 *
 * Lưu ý: kích thước trong central directory do bên tạo tệp khai báo. Đây là hàng rào
 * chặn trường hợp phổ biến, không phải bảo chứng tuyệt đối — adm-zip cấp phát bộ đệm
 * theo chính con số đó nên khai gian sẽ làm getData() thất bại chứ không cấp phát lố.
 */

/** 64MB sau giải nén: một .docx 15MB đầy ảnh chỉ nở tới ~20MB, dư hơn 3 lần biên độ. */
export const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;

/** Chặn zip chứa hàng vạn entry rỗng — mỗi entry vẫn tốn chi phí xử lý. */
export const MAX_ENTRIES = 2000;

/**
 * Trả về thông báo lỗi (tiếng Việt, hiển thị được cho người dùng) nếu tệp vượt giới hạn,
 * hoặc null nếu an toàn. Không ném lỗi để nơi gọi trả 400 thay vì 500.
 */
export function checkArchiveLimits(zip: AdmZip): string | null {
  const entries = zip.getEntries();

  if (entries.length > MAX_ENTRIES) {
    return `Tệp .docx chứa quá nhiều thành phần (${entries.length}, tối đa ${MAX_ENTRIES}).`;
  }

  let total = 0;
  for (const entry of entries) {
    total += entry.header.size;
    if (total > MAX_UNCOMPRESSED_BYTES) {
      return `Nội dung tệp .docx sau giải nén vượt quá ${Math.round(MAX_UNCOMPRESSED_BYTES / 1024 / 1024)}MB.`;
    }
  }

  return null;
}
