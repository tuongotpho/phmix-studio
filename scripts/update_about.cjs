const fs = require('fs');

let html = fs.readFileSync('gui/index.html', 'utf-8');

const startIndex = html.indexOf('<div class="tab-content" id="tab-content-about">');
// Look for the next tab-content which is admin
const endIndex = html.indexOf('<div class="tab-content" id="tab-content-admin">');

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find boundaries");
    process.exit(1);
}

// Find the preceding comment for admin to keep it clean if possible.
const commentIndex = html.lastIndexOf('<!--', endIndex);
const finalEndIndex = (commentIndex > startIndex) ? commentIndex : endIndex;

const newAboutHtml = `                <div class="tab-content" id="tab-content-about">
                    <!-- Header Hero Section -->
                    <div style="background: var(--ink); color: var(--bg); padding: 40px 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 24px; text-align: center; gap: 16px; border: 1px solid var(--ink);">
                        <div style="font-size: 56px; line-height: 1; margin: 0; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));">🧪</div>
                        <div>
                            <h2 style="font-size: 28px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">pH-mix Pro</h2>
                            <div id="app-version-about" style="font-family: var(--font-mono); font-size: 14px; opacity: 0.7; margin-top: 4px;">Phiên bản: -</div>
                        </div>
                        <p style="font-size: 15px; max-width: 480px; opacity: 0.9; margin: 0; line-height: 1.6;">Phần mềm trộn đề trắc nghiệm chuyên nghiệp, giữ nguyên 100% định dạng MathType, tự động tối ưu bố cục và tiết kiệm giấy in tối đa.</p>
                    </div>

                    <!-- Bento Grid Layout -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
                        
                        <!-- License Card -->
                        <div style="border: 1px solid var(--ink); padding: 24px; background: #fff; display: flex; flex-direction: column; gap: 20px; box-shadow: 4px 4px 0px var(--ink);">
                            <div style="display: flex; align-items: center; gap: 12px; border-bottom: 2px solid var(--ink); padding-bottom: 16px;">
                                <span style="font-size: 20px;">🔑</span>
                                <h3 style="font-size: 17px; font-weight: 700; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">Bản Quyền</h3>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 14px; font-size: 14px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="opacity: 0.7; font-weight: 600;">Trạng thái:</span>
                                    <span id="license-status-val" style="font-weight: 700; padding: 4px 12px; background: #dcfce7; color: #166534; border: 1px solid #166534; border-radius: 4px; font-size: 12px; font-family: var(--font-mono);">Đã kích hoạt</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #e5e7eb; padding-top: 14px;">
                                    <span style="opacity: 0.7; font-weight: 600;">Gói bản quyền:</span>
                                    <span id="license-plan-val" style="font-weight: 700; font-family: var(--font-mono); color: var(--accent);">-</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #e5e7eb; padding-top: 14px;">
                                    <span style="opacity: 0.7; font-weight: 600;">Ngày hết hạn:</span>
                                    <span id="license-expiry-val" style="font-weight: 700; font-family: var(--font-mono);">-</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #e5e7eb; padding-top: 14px;">
                                    <span style="opacity: 0.7; font-weight: 600;">Thời gian còn lại:</span>
                                    <span id="license-days-val" style="font-weight: 700; font-family: var(--font-mono); color: #dc2626;">-</span>
                                </div>
                            </div>
                        </div>

                        <!-- Contact & Payment Card -->
                        <div style="border: 1px solid var(--ink); padding: 24px; background: #fff; display: flex; flex-direction: column; gap: 20px; box-shadow: 4px 4px 0px var(--ink);">
                            <div style="display: flex; align-items: center; gap: 12px; border-bottom: 2px solid var(--ink); padding-bottom: 16px;">
                                <span style="font-size: 20px;">💬</span>
                                <h3 style="font-size: 17px; font-weight: 700; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">Liên Hệ</h3>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 14px; font-size: 14px;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <span style="opacity: 0.7; font-weight: 600;">Tác giả:</span>
                                    <span style="font-weight: 700;">Lê Thanh</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #e5e7eb; padding-top: 14px;">
                                    <span style="opacity: 0.7; font-weight: 600;">Trang chủ:</span>
                                    <a href="https://ph-mix.ai.studio" target="_blank" style="font-weight: 700; color: var(--accent); text-decoration: underline; text-underline-offset: 4px;">pH-mix by AI-Studio</a>
                                </div>
                                <div style="margin-top: 10px; background: var(--bg); border: 2px solid var(--ink); padding: 16px; cursor: pointer; transition: transform 0.2s, background 0.2s;" id="bank-copy-card" title="Nhấp để sao chép số tài khoản & xem chi tiết" onmouseover="this.style.transform='translateY(-2px)'; this.style.background='#f9fafb'" onmouseout="this.style.transform='none'; this.style.background='var(--bg)'">
                                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 12px; opacity: 0.6; text-align: center;">Thanh toán / Gia hạn</div>
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px;">
                                        <span style="opacity: 0.8; font-weight: 500;">Chủ TK:</span><span style="font-weight: 700;">Lê Việt Thanh</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px;">
                                        <span style="opacity: 0.8; font-weight: 500;">Số TK:</span><span style="font-weight: 700; font-family: var(--font-mono); color: var(--accent); font-size: 15px;">938118 📋</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; font-size: 13px;">
                                        <span style="opacity: 0.8; font-weight: 500;">Ngân hàng:</span><span style="font-weight: 700;">MBBank</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Instructions Card (Full Width) -->
                        <div style="border: 1px solid var(--ink); padding: 32px 24px; background: #fff; grid-column: 1 / -1; display: flex; flex-direction: column; gap: 24px; box-shadow: 4px 4px 0px var(--ink); margin-bottom: 16px;">
                            <div style="display: flex; align-items: center; gap: 16px; border-bottom: 3px solid var(--ink); padding-bottom: 20px;">
                                <span style="font-size: 28px;">📖</span>
                                <div>
                                    <h3 style="font-size: 20px; font-weight: 800; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">Hướng Dẫn Soạn Đề Chuẩn</h3>
                                    <div style="font-size: 14px; opacity: 0.7; margin-top: 4px; font-weight: 500;">Quy tắc định dạng để phần mềm nhận diện chính xác 100%</div>
                                </div>
                            </div>
                            
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 32px;">
                                <!-- Column 1 -->
                                <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.7; display: flex; flex-direction: column; gap: 12px;">
                                    <li><strong style="color: var(--accent); font-weight: 700;">Phần thi:</strong> Sử dụng các tiêu đề rõ ràng bằng tiếng Việt: <code style="background: var(--bg); padding: 4px 8px; border: 1px solid #e5e7eb; font-family: var(--font-mono); font-size: 13px; font-weight: 600;">PHẦN I</code>, <code style="background: var(--bg); padding: 4px 8px; border: 1px solid #e5e7eb; font-family: var(--font-mono); font-size: 13px; font-weight: 600;">PHẦN II</code>.</li>
                                    <li><strong style="color: var(--accent); font-weight: 700;">Tên câu hỏi:</strong> Phải bắt đầu bằng <code style="background: var(--bg); padding: 4px 8px; border: 1px solid #e5e7eb; font-family: var(--font-mono); font-size: 13px; font-weight: 600;">Câu [Số].</code> hoặc <code style="background: var(--bg); padding: 4px 8px; border: 1px solid #e5e7eb; font-family: var(--font-mono); font-size: 13px; font-weight: 600;">Question [Số].</code> (lưu ý có dấu chấm).</li>
                                    <li><strong style="color: var(--accent); font-weight: 700;">Phương án:</strong> Viết rõ ràng các chữ cái lựa chọn <code style="background: var(--bg); padding: 4px 8px; border: 1px solid #e5e7eb; font-family: var(--font-mono); font-size: 13px; font-weight: 600;">A.</code>, <code style="background: var(--bg); padding: 4px 8px; border: 1px solid #e5e7eb; font-family: var(--font-mono); font-size: 13px; font-weight: 600;">B.</code>, <code style="background: var(--bg); padding: 4px 8px; border: 1px solid #e5e7eb; font-family: var(--font-mono); font-size: 13px; font-weight: 600;">C.</code>, <code style="background: var(--bg); padding: 4px 8px; border: 1px solid #e5e7eb; font-family: var(--font-mono); font-size: 13px; font-weight: 600;">D.</code>.</li>
                                </ul>
                                <!-- Column 2 -->
                                <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.7; display: flex; flex-direction: column; gap: 12px;">
                                    <li><strong style="color: var(--accent); font-weight: 700;">Đáp án Gạch chân:</strong> Gạch chân trực tiếp vào phương án đúng ở đề gốc (ví dụ: <code style="background: var(--bg); padding: 4px 8px; border: 1px solid #e5e7eb; font-family: var(--font-mono); font-size: 13px; font-weight: 600;"><u>A</u>.</code>).</li>
                                    <li><strong style="color: var(--accent); font-weight: 700;">Bảng / Lời giải chi tiết:</strong> Có thể trích xuất đáp án tự động từ phần lời giải nằm ở cuối tệp (ví dụ: <em>"Câu 1. Chọn D"</em>).</li>
                                    <li><strong style="color: var(--accent); font-weight: 700;">Câu hỏi chùm:</strong> Bắt đầu nhóm câu hỏi bằng văn bản <em>"Sử dụng thông tin sau để trả lời..."</em> để khóa nhóm khi xáo trộn.</li>
                                </ul>
                            </div>

                            <div style="margin-top: 12px; background: var(--ink); color: #fff; padding: 20px; text-align: center; font-size: 15px; font-weight: 600; cursor: pointer; transition: opacity 0.2s; border: 1px solid var(--ink);" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'" onclick="window.location.href='demau.docx'">
                                👉 TẢI FILE WORD MẪU CHUẨN (demau.docx)
                            </div>
                        </div>
                    </div>
                </div>
`;

html = html.substring(0, startIndex) + newAboutHtml + '\n                ' + html.substring(finalEndIndex);
fs.writeFileSync('gui/index.html', html);
console.log("Updated about section.");
