/**
 * UI Helper Utilities for pH-mix Frontend
 */

export function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Header xác thực cho mọi lời gọi /api/*.
 *
 * Backend chỉ chấp nhận danh tính lấy từ chữ ký của Firebase ID token; header
 * X-User-Uid cũ đã bị bỏ vì client tự đặt được (dùng nó làm khoá rate limit
 * đồng nghĩa với không có rate limit). Khách chưa đăng nhập vẫn gọi được —
 * chỉ bị xếp vào hạn mức thấp hơn theo IP.
 */
export async function getAuthHeaders(extraHeaders = {}) {
    const headers = { ...extraHeaders };
    const auth = window.firebaseAuth;
    if (auth && auth.currentUser) {
        try {
            headers['Authorization'] = `Bearer ${await auth.currentUser.getIdToken()}`;
        } catch (e) {
            console.error('Không lấy được Firebase ID token:', e);
        }
    }
    return headers;
}

let purifyMissingLogged = false;

export function renderSafeHTML(htmlStr) {
    if (!htmlStr) return '';

    // Thiếu DOMPurify (CDN bị chặn, SRI không khớp) thì HẠ CẤP VỀ VĂN BẢN THUẦN, không
    // tự sanitize. Bản tự viết trước đây ở đây thủng ở cả ba mặt: chỉ so khớp chuỗi thô
    // 'javascript:' nên lọt java&#9;script:, bỏ sót <base>/<form>/<style>, và việc
    // sanitize trên DOM rồi trả innerHTML để nơi gọi parse lại chính là đường mXSS.
    // Nội dung ở đây đến từ câu hỏi công khai của người dùng khác — mất định dạng
    // chấp nhận được, chạy mã của họ thì không.
    if (!window.DOMPurify) {
        if (!purifyMissingLogged) {
            purifyMissingLogged = true;
            console.error('[Security] Không nạp được DOMPurify — nội dung câu hỏi đang hiển thị dạng văn bản thuần.');
        }
        return escapeHTML(htmlStr).replace(/\r\n|\r|\n/g, '<br>');
    }

    // Convert newlines to <br> if not already containing HTML tags
    let processed = htmlStr;
    if (!/<[a-z][\s\S]*>/i.test(processed)) {
        processed = processed.replace(/\r\n|\r|\n/g, '<br>');
    }

    return window.DOMPurify.sanitize(processed);
}

export function renderMath() {
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise().catch(err => console.warn('MathJax error:', err));
    }
}

export function addLog(text, type = 'info') {
    const logConsole = document.getElementById('log-console');
    if (!logConsole) return;

    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    
    const now = new Date();
    const timeStr = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}] `;
    
    line.innerText = timeStr + text;
    logConsole.appendChild(line);
    logConsole.scrollTop = logConsole.scrollHeight;
}

export function updateProgress(percent, text) {
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressText) progressText.innerText = text;
}

export function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'answer-editor-overlay';
        overlay.style.zIndex = '9999999';

        overlay.innerHTML = `
            <div class="answer-editor-modal" style="max-width: 420px; height: auto; max-height: 90vh; display: flex; flex-direction: column; border: 2px solid var(--ink); border-radius: 8px; box-shadow: 6px 6px 0 var(--ink);">
                <div class="answer-editor-header" style="background: var(--ink); color: #fff; padding: 10px 14px;">
                    <h3 style="font-size: 14px; margin: 0; color: #fff;">${escapeHTML(title)}</h3>
                </div>
                <div style="padding: 16px; font-size: 13px; line-height: 1.5; color: var(--ink); flex: 1; overflow-y: auto;">
                    ${escapeHTML(message)}
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 8px; padding: 10px 14px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
                    <button id="modal-btn-cancel" class="btn btn-secondary" style="font-size: 12px; padding: 6px 14px;">Hủy</button>
                    <button id="modal-btn-confirm" class="btn btn-primary" style="font-size: 12px; padding: 6px 14px;">Xác nhận</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const btnCancel = overlay.querySelector('#modal-btn-cancel');
        const btnConfirm = overlay.querySelector('#modal-btn-confirm');

        btnCancel.addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });

        btnConfirm.addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });
    });
}

export function showAlertDialog(title, message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'answer-editor-overlay';
        overlay.style.zIndex = '9999999';

        overlay.innerHTML = `
            <div class="answer-editor-modal" style="max-width: 420px; height: auto; max-height: 90vh; display: flex; flex-direction: column; border: 2px solid var(--ink); border-radius: 8px; box-shadow: 6px 6px 0 var(--ink);">
                <div class="answer-editor-header" style="background: var(--ink); color: #fff; padding: 10px 14px;">
                    <h3 style="font-size: 14px; margin: 0; color: #fff;">${escapeHTML(title)}</h3>
                </div>
                <div style="padding: 16px; font-size: 13px; line-height: 1.5; color: var(--ink); flex: 1; overflow-y: auto;">
                    ${escapeHTML(message)}
                </div>
                <div style="display: flex; justify-content: flex-end; padding: 10px 14px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
                    <button id="modal-btn-ok" class="btn btn-primary" style="font-size: 12px; padding: 6px 16px;">Đóng</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const btnOk = overlay.querySelector('#modal-btn-ok');

        btnOk.addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });
    });
}

export function showPromptDialog(message, defaultValue = '') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'answer-editor-overlay';
        overlay.style.zIndex = '9999999';

        overlay.innerHTML = `
            <div class="answer-editor-modal" style="max-width: 450px; height: auto; max-height: 90vh; display: flex; flex-direction: column; border: 2px solid var(--ink); border-radius: 8px; box-shadow: 6px 6px 0 var(--ink);">
                <div class="answer-editor-header" style="background: var(--ink); color: #fff; padding: 10px 14px;">
                    <h3 style="font-size: 14px; margin: 0; color: #fff;">Nhập thông tin</h3>
                </div>
                <div style="padding: 16px; font-size: 13px; line-height: 1.5; color: var(--ink); flex: 1; overflow-y: auto;">
                    <div style="margin-bottom: 8px;">${escapeHTML(message)}</div>
                    <input type="text" id="prompt-input" value="${escapeHTML(defaultValue)}" style="width: 100%; padding: 8px; font-size: 13px; border: 1.5px solid var(--ink); border-radius: 4px; outline: none;">
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 8px; padding: 10px 14px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
                    <button id="prompt-btn-cancel" class="btn btn-secondary" style="font-size: 12px; padding: 6px 14px;">Hủy</button>
                    <button id="prompt-btn-ok" class="btn btn-primary" style="font-size: 12px; padding: 6px 14px;">Đồng ý</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const inputEl = overlay.querySelector('#prompt-input');
        const btnCancel = overlay.querySelector('#prompt-btn-cancel');
        const btnOk = overlay.querySelector('#prompt-btn-ok');

        inputEl.focus();

        btnCancel.addEventListener('click', () => {
            overlay.remove();
            resolve(null);
        });

        btnOk.addEventListener('click', () => {
            const val = inputEl.value;
            overlay.remove();
            resolve(val);
        });

        inputEl.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                const val = inputEl.value;
                overlay.remove();
                resolve(val);
            }
        });
    });
}

export async function uploadBase64ToStorage(base64Data, ext = 'png') {
    if (!window.firebaseStorage || !window.firebaseAPI) {
        throw new Error("Firebase Storage chưa được khởi tạo!");
    }
    const { ref, uploadString, getDownloadURL } = window.firebaseAPI;
    const storage = window.firebaseStorage;
    const auth = window.firebaseAuth;
    const uid = (auth && auth.currentUser) ? auth.currentUser.uid : 'anonymous';
    const filename = `users/${uid}/images/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const storageRef = ref(storage, filename);

    let pureBase64 = base64Data;
    let format = 'base64';

    if (base64Data.startsWith('data:')) {
        pureBase64 = base64Data;
        format = 'data_url';
    }

    await uploadString(storageRef, pureBase64, format);
    const url = await getDownloadURL(storageRef);
    return url;
}
