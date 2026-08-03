import { DEFAULT_PROJECT_ID, firebaseConfig } from '../config/env.js';

/**
 * Tải ảnh từ URL do client cung cấp — có kiểm soát.
 *
 * Ảnh trong ngân hàng câu hỏi được lưu trên Firebase Storage và tham chiếu bằng URL
 * trong mediaItems[].url. Các URL đó đi qua request body của /api/generate-base-docx
 * và /api/shuffle-bank — hai endpoint KHÔNG yêu cầu đăng nhập.
 *
 * Nếu tải thẳng bằng fetch(media.url) thì bất kỳ ai cũng ép được máy chủ gọi tới địa
 * chỉ nội bộ bất kỳ, rồi nhận nguyên phần phản hồi nhét trong file .docx trả về — tức
 * SSRF kèm đường rò dữ liệu. Module này chặn bằng danh sách host cho phép, cấm chuyển
 * hướng, đặt thời gian chờ và giới hạn dung lượng.
 */

/** 8MB — lớn hơn mọi ảnh minh hoạ hợp lý, đủ nhỏ để không thổi bay instance 1GB. */
export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

/** Không để một URL treo giữ mãi request trộn đề. */
export const MEDIA_FETCH_TIMEOUT_MS = 5000;

function bucketHost(bucket: string | undefined): string[] {
  if (!bucket) return [];
  // storageBucket có thể ở dạng "abc.firebasestorage.app" hoặc "gs://abc.appspot.com"
  const clean = bucket.replace(/^gs:\/\//, '').split('/')[0].trim().toLowerCase();
  return clean ? [clean] : [];
}

export function allowedMediaHosts(): Set<string> {
  const fromEnv = (process.env.MEDIA_ALLOWED_HOSTS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  return new Set([
    'firebasestorage.googleapis.com',
    'storage.googleapis.com',
    `${DEFAULT_PROJECT_ID}.firebasestorage.app`,
    `${DEFAULT_PROJECT_ID}.appspot.com`,
    ...bucketHost(firebaseConfig?.storageBucket),
    ...fromEnv
  ]);
}

export function isAllowedMediaUrl(raw: unknown): boolean {
  if (typeof raw !== 'string' || !raw) return false;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  // https bắt buộc: chặn luôn http nội bộ, file:, gopher:, data: ...
  if (url.protocol !== 'https:') return false;

  // Danh sách host cho phép cũng đồng thời loại bỏ mọi địa chỉ IP trực tiếp.
  return allowedMediaHosts().has(url.hostname.toLowerCase());
}

/**
 * Tải ảnh và trả về Buffer. Ném lỗi nếu URL không được phép, bị chuyển hướng,
 * quá thời gian chờ hoặc vượt dung lượng. Bên gọi chịu trách nhiệm bỏ qua ảnh lỗi.
 */
export async function fetchMediaStrict(raw: string): Promise<Buffer> {
  if (!isAllowedMediaUrl(raw)) {
    throw new Error(`URL ảnh không nằm trong danh sách cho phép: ${String(raw).slice(0, 120)}`);
  }

  const res = await fetch(raw, {
    // Không tự đi theo chuyển hướng: một 302 trỏ về host nội bộ sẽ vô hiệu hoá allowlist.
    redirect: 'manual',
    signal: AbortSignal.timeout(MEDIA_FETCH_TIMEOUT_MS)
  });

  if (res.status >= 300 && res.status < 400) {
    throw new Error('URL ảnh trả về chuyển hướng — bị từ chối.');
  }
  if (!res.ok) {
    throw new Error(`Không tải được ảnh (HTTP ${res.status}).`);
  }

  const declared = Number(res.headers.get('content-length') || '0');
  if (declared > MAX_MEDIA_BYTES) {
    throw new Error(`Ảnh vượt quá ${MAX_MEDIA_BYTES} byte.`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('Phản hồi không có nội dung.');
  }

  // Đọc theo luồng và đếm byte: Content-Length có thể thiếu hoặc khai gian.
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_MEDIA_BYTES) {
      await reader.cancel();
      throw new Error(`Ảnh vượt quá ${MAX_MEDIA_BYTES} byte.`);
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}
