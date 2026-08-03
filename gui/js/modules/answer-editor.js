/**
 * Answer Editor Module
 * Modal for live online answer editing and validation warnings display.
 */

import { renderSafeHTML, addLog, renderMath } from '../utils/ui-helpers.js';

export let answerOverrides = {};

export function setAnswerOverrides(newOverrides) {
    answerOverrides = newOverrides;
}

export function resetAnswerOverrides() {
    answerOverrides = {};
}

export function openAnswerEditorModal(unansweredList) {
    if (!unansweredList || unansweredList.length === 0) return;

    let currentIndex = 0;
    
    // Create modal container
    const overlay = document.createElement('div');
    overlay.className = 'answer-editor-overlay';
    
    overlay.innerHTML = `
        <div class="answer-editor-modal">
            <div class="answer-editor-header">
                <h3>✏️ SỬA ĐÁP ÁN ONLINE TRỰC TIẾP</h3>
                <button class="answer-editor-close" id="editor-close-btn">&times;</button>
            </div>
            <div class="answer-editor-subbar">
                <div class="answer-editor-progress-container">
                    <span class="answer-editor-progress-label" id="editor-progress-text">Đã sửa: 0/0 câu</span>
                    <div class="answer-editor-progress-bar-bg">
                        <div class="answer-editor-progress-bar-fill" id="editor-progress-fill"></div>
                    </div>
                </div>
                <div class="answer-editor-pills" id="editor-pills-container"></div>
            </div>
            <div class="answer-editor-body" id="editor-question-body">
                <!-- Dynamic Question Content -->
            </div>
            <div class="answer-editor-footer">
                <div class="answer-editor-nav-buttons">
                    <button class="btn btn-secondary btn-editor-nav" id="editor-prev-btn">◀ Câu trước</button>
                    <button class="btn btn-secondary btn-editor-nav" id="editor-next-btn">Câu sau ▶</button>
                </div>
                <div class="answer-editor-actions">
                    <button class="btn btn-secondary btn-editor-nav" id="editor-cancel-btn">Bỏ qua & Đóng</button>
                    <button class="btn btn-primary btn-editor-nav" id="editor-save-btn">✅ Xác nhận & Lưu</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden'; // Lock background scrolling
    
    const pillsContainer = overlay.querySelector('#editor-pills-container');
    const questionBody = overlay.querySelector('#editor-question-body');
    const progressText = overlay.querySelector('#editor-progress-text');
    const progressFill = overlay.querySelector('#editor-progress-fill');
    
    const prevBtn = overlay.querySelector('#editor-prev-btn');
    const nextBtn = overlay.querySelector('#editor-next-btn');
    const closeBtn = overlay.querySelector('#editor-close-btn');
    const cancelBtn = overlay.querySelector('#editor-cancel-btn');
    const saveBtn = overlay.querySelector('#editor-save-btn');
    
    function getQuestionKey(q) {
        if (q.part === 1) return String(q.number);
        if (q.part === 2) return `p2_${q.number}`;
        return `p3_${q.number}`;
    }
    
    function isQuestionAnswered(q) {
        const key = getQuestionKey(q);
        const val = answerOverrides[key];
        if (val === undefined || val === null || val === "") return false;
        if (q.part === 2) {
            return val.a !== undefined && val.b !== undefined && val.c !== undefined && val.d !== undefined;
        }
        return true;
    }
    
    function updateProgressAndPills() {
        let answeredCount = 0;
        unansweredList.forEach(q => {
            if (isQuestionAnswered(q)) {
                answeredCount++;
            }
        });
        
        const total = unansweredList.length;
        const pct = total > 0 ? (answeredCount / total) * 100 : 0;
        
        progressText.innerText = `Đã sửa: ${answeredCount}/${total} câu (${Math.round(pct)}%)`;
        progressFill.style.width = `${pct}%`;
        
        // Render Pills
        pillsContainer.innerHTML = '';
        unansweredList.forEach((q, idx) => {
            const pill = document.createElement('button');
            pill.className = 'answer-editor-pill';
            if (idx === currentIndex) pill.classList.add('active');
            if (isQuestionAnswered(q)) pill.classList.add('completed');
            
            pill.innerText = `Câu ${q.number}`;
            pill.addEventListener('click', () => {
                currentIndex = idx;
                renderQuestion(currentIndex);
            });
            pillsContainer.appendChild(pill);
        });
        
        // Nav button states
        prevBtn.disabled = currentIndex === 0;
        prevBtn.style.opacity = currentIndex === 0 ? '0.4' : '1';
        
        nextBtn.disabled = currentIndex === total - 1;
        nextBtn.style.opacity = currentIndex === total - 1 ? '0.4' : '1';
    }
    
    function getCleanQuestionText(q) {
        let cleanText = q.questionText || "";
        cleanText = cleanText.replace(/[\u00a0\u200b\ufeff]+/g, ' ');
        
        if (q.part === 1 && q.choices && q.choices.length > 0) {
            const optA = q.choices[0].replace(/[\u00a0\u200b\ufeff]+/g, ' ').trim();
            let idx = cleanText.indexOf(optA);
            if (idx === -1) idx = cleanText.indexOf(optA.trim());
            if (idx === -1) {
                const noPrefix = optA.replace(/^\s*A\s*[\.\:\)\/]\s*/i, '').trim();
                if (noPrefix) {
                    idx = cleanText.indexOf(noPrefix);
                    if (idx !== -1) {
                        const prefixPart = cleanText.substring(0, idx);
                        const lastAMatch = prefixPart.match(/\s*A\s*[\.\:\)\/]\s*$/i);
                        if (lastAMatch) {
                            idx = prefixPart.length - lastAMatch[0].length;
                        }
                    }
                }
            }
            if (idx !== -1) {
                cleanText = cleanText.substring(0, idx).trim();
            }
            
            let lines = cleanText.split('\n');
            lines = lines.filter(line => {
                const trimmed = line.replace(/[\u00a0\u200b\ufeff]+/g, ' ').trim();
                if (!trimmed) return false;
                if (/^[A-D]\s*[\.\:\)\/\-]/i.test(trimmed)) return false;
                return true;
            });
            cleanText = lines.join('\n').trim();
        } else if (q.part === 2 && q.statements && q.statements.length > 0) {
            const optA = q.statements[0].replace(/[\u00a0\u200b\ufeff]+/g, ' ').trim();
            let idx = cleanText.indexOf(optA);
            if (idx === -1) idx = cleanText.indexOf(optA.trim());
            if (idx === -1) {
                const noPrefix = optA.replace(/^\s*a\s*[\.\:\)\/]\s*/i, '').trim();
                if (noPrefix) {
                    idx = cleanText.indexOf(noPrefix);
                    if (idx !== -1) {
                        const prefixPart = cleanText.substring(0, idx);
                        const lastAMatch = prefixPart.match(/\s*a\s*[\.\:\)\/]\s*$/i);
                        if (lastAMatch) {
                            idx = prefixPart.length - lastAMatch[0].length;
                        }
                    }
                }
            }
            if (idx !== -1) {
                cleanText = cleanText.substring(0, idx).trim();
            }
            
            let lines = cleanText.split('\n');
            lines = lines.filter(line => {
                const trimmed = line.replace(/[\u00a0\u200b\ufeff]+/g, ' ').trim();
                if (!trimmed) return false;
                if (/^[a-d]\s*[\.\:\)\/\-]/i.test(trimmed)) return false;
                return true;
            });
            cleanText = lines.join('\n').trim();
        }
        return cleanText;
    }

    function cleanOptionOrStatementPrefix(text, prefixChar) {
        if (!text) return "";
        let clean = text.replace(/^[\s\u00a0\u200b\ufeff]+|[\s\u00a0\u200b\ufeff]+$/g, '');
        const escapedChar = prefixChar.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const prefixRegex = new RegExp('^' + escapedChar + '[\\s\\u00a0\\u200b\\ufeff]*[\\.\\:\\)\\-\\/\\u00a0]+[\\s\\u00a0\\u200b\\ufeff]*', 'i');
        
        if (prefixRegex.test(clean)) {
            clean = clean.replace(prefixRegex, '');
        } else {
            const spacePrefixRegex = new RegExp('^' + escapedChar + '[\\s\\u00a0\\u200b\\ufeff]+', 'i');
            if (spacePrefixRegex.test(clean)) {
                clean = clean.replace(spacePrefixRegex, '');
            }
        }
        return clean.trim();
    }

    function renderQuestion(index) {
        currentIndex = index;
        const q = unansweredList[index];
        const key = getQuestionKey(q);
        const val = answerOverrides[key];
        
        const partTitle = q.part === 1 ? 'Phần I — Trắc nghiệm nhiều lựa chọn' :
                          q.part === 2 ? 'Phần II — Trắc nghiệm Đúng/Sai' :
                                         'Phần III — Trắc nghiệm trả lời ngắn';
        
        let answerAreaHtml = '';
        const cleanQuestionText = getCleanQuestionText(q);
        
        if (q.part === 1) {
            answerAreaHtml = `<div class="answer-choice-grid">`;
            const chars = ['A', 'B', 'C', 'D'];
            chars.forEach((char, i) => {
                const isSelected = val === char;
                let choiceLabel = `Đáp án ${char}`;
                if (q.choices && q.choices[i]) {
                    choiceLabel = q.choices[i];
                }
                
                const choiceText = cleanOptionOrStatementPrefix(choiceLabel, char);
                
                answerAreaHtml += `
                    <button class="answer-choice-btn ${isSelected ? 'selected' : ''}" data-char="${char}">
                        <span class="answer-choice-char">${char}</span>
                        <span>${renderSafeHTML(choiceText)}</span>
                    </button>
                `;
            });
            answerAreaHtml += `</div>`;
        } else if (q.part === 2) {
            answerAreaHtml = `<div class="answer-tf-table">`;
            const labels = ['a', 'b', 'c', 'd'];
            const currentVal = val || {};
            
            labels.forEach((label, i) => {
                const ansState = currentVal[label];
                let stmtText = `Mệnh đề ${label}`;
                if (q.statements && q.statements[i]) {
                    stmtText = q.statements[i];
                }
                
                const cleanStmtText = cleanOptionOrStatementPrefix(stmtText, label);
                
                answerAreaHtml += `
                    <div class="answer-tf-row">
                        <div class="answer-tf-desc">${renderSafeHTML(cleanStmtText)}</div>
                        <div class="answer-tf-options">
                            <button class="answer-tf-opt-btn opt-true ${ansState === true ? 'selected' : ''}" data-label="${label}" data-value="true">Đúng</button>
                            <button class="answer-tf-opt-btn opt-false ${ansState === false ? 'selected' : ''}" data-label="${label}" data-value="false">Sai</button>
                        </div>
                    </div>
                `;
            });
            answerAreaHtml += `</div>`;
        } else {
            const textVal = val !== undefined ? val : '';
            answerAreaHtml += `
                <div class="answer-short-container">
                    <label for="short-answer-input">Nhập giá trị đáp án chính xác (ví dụ: 12 hoặc 3,5):</label>
                    <input type="text" id="short-answer-input" class="answer-short-input" value="${textVal}" placeholder="Gõ đáp số..." autocomplete="off">
                </div>
            `;
        }
        
        questionBody.innerHTML = `
            <div class="answer-editor-q-header">
                <span class="answer-editor-q-badge">${partTitle} &bull; Câu số ${q.number}</span>
                <div class="answer-editor-q-text">${renderSafeHTML(cleanQuestionText)}</div>
            </div>
            ${answerAreaHtml}
        `;
        
        if (q.part === 1) {
            const choiceBtns = questionBody.querySelectorAll('.answer-choice-btn');
            choiceBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const char = btn.getAttribute('data-char');
                    answerOverrides[key] = char;
                    
                    choiceBtns.forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    
                    updateProgressAndPills();
                    
                    if (currentIndex < unansweredList.length - 1) {
                        setTimeout(() => {
                            if (currentIndex === index) {
                                renderQuestion(currentIndex + 1);
                            }
                        }, 300);
                    }
                });
            });
        } else if (q.part === 2) {
            const rowEls = questionBody.querySelectorAll('.answer-tf-row');
            rowEls.forEach(row => {
                const optBtns = row.querySelectorAll('.answer-tf-opt-btn');
                optBtns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        const lbl = btn.getAttribute('data-label');
                        const bVal = btn.getAttribute('data-value') === 'true';
                        
                        if (!answerOverrides[key]) {
                            answerOverrides[key] = {};
                        }
                        answerOverrides[key][lbl] = bVal;
                        
                        optBtns.forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                        
                        updateProgressAndPills();
                    });
                });
            });
        } else {
            const inputEl = questionBody.querySelector('#short-answer-input');
            if (inputEl) {
                inputEl.focus();
                inputEl.addEventListener('input', (e) => {
                    const text = e.target.value.trim();
                    answerOverrides[key] = text;
                    updateProgressAndPills();
                });
            }
        }
        
        updateProgressAndPills();
        renderMath();
    }
    
    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) renderQuestion(currentIndex - 1);
    });
    
    nextBtn.addEventListener('click', () => {
        if (currentIndex < unansweredList.length - 1) renderQuestion(currentIndex + 1);
    });
    
    function closeModal() {
        overlay.remove();
        document.body.style.overflow = '';
    }
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    
    saveBtn.addEventListener('click', () => {
        let completedCount = 0;
        unansweredList.forEach(q => {
            if (isQuestionAnswered(q)) completedCount++;
        });
        
        closeModal();
        showValidationResults(unansweredList, true);
        
        if (completedCount > 0) {
            addLog(`Đã cập nhật đáp án trực tuyến thành công cho ${completedCount}/${unansweredList.length} câu hỏi bị thiếu!`, 'success');
        } else {
            addLog('Đã đóng công cụ sửa đáp án trực tuyến.', 'info');
        }
    });
    
    renderQuestion(currentIndex);
}

export function showValidationResults(unansweredList, preserveOutputList = false) {
    const logConsole = document.getElementById('log-console');
    const outputList = document.getElementById('output-list');
    const outputPlaceholder = document.getElementById('output-placeholder');

    if (!logConsole) return;

    if (outputList && !preserveOutputList) {
        outputList.style.display = 'none';
        outputList.innerHTML = '';
    }

    if (unansweredList && unansweredList.length > 0) {
        if (outputPlaceholder) outputPlaceholder.style.display = "none";

        const oldWarnings = logConsole.querySelectorAll('.validation-warning-log');
        oldWarnings.forEach(w => w.remove());

        let completedOverridesCount = 0;
        unansweredList.forEach(q => {
            const key = q.part === 1 ? String(q.number) : q.part === 2 ? `p2_${q.number}` : `p3_${q.number}`;
            const val = answerOverrides[key];
            if (val !== undefined && val !== null && val !== "") {
                if (q.part === 2) {
                    if (val.a !== undefined && val.b !== undefined && val.c !== undefined && val.d !== undefined) {
                        completedOverridesCount++;
                    }
                } else {
                    completedOverridesCount++;
                }
            }
        });

        const mainMsgDiv = document.createElement('div');
        mainMsgDiv.className = 'log-line validation-warning-log';
        if (completedOverridesCount === unansweredList.length) {
            mainMsgDiv.setAttribute('style', 'margin-top: 10px; padding: 14px; background: #ecfdf5; border: 2px solid #10b981; box-shadow: 4px 4px 0 #10b981; text-align: left; font-size: 13px; border-radius: 8px;');
            mainMsgDiv.innerHTML = `
                <div style="font-weight: 800; color: #047857; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; font-size: 14px;">
                    🎉 ĐÃ SỬA ĐỦ ĐÁP ÁN TRỰC TUYẾN (${completedOverridesCount}/${unansweredList.length} CÂU)
                </div>
                <div style="color: #047857; line-height: 1.5; font-weight: bold; margin-bottom: 8px;">
                    Thầy/Cô đã hoàn tất sửa tất cả ${completedOverridesCount} câu hỏi thiếu đáp án bằng công cụ sửa đáp án trực tuyến!
                </div>
                <div style="font-size: 12px; color: var(--ink); line-height: 1.5; margin-bottom: 12px;">
                    👉 Hệ thống sẽ tự động gạch chân đáp án đúng và xuất file Excel/QR code đồng bộ đầy đủ. Thầy/Cô có thể tiến hành trộn đề ngay bây giờ.
                </div>
                <button id="btn-open-editor" class="btn" style="width: 100%; border-radius: 0; padding: 10px; background: #10b981; border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); font-size: 13px; font-weight: 800; color: white; cursor: pointer;">
                    ✏️ XEM LẠI / CHỈNH SỬA ĐÁP ÁN ONLINE
                </button>
            `;
        } else if (completedOverridesCount > 0) {
            mainMsgDiv.setAttribute('style', 'margin-top: 10px; padding: 14px; background: #fffbeb; border: 2px solid #d97706; box-shadow: 4px 4px 0 #d97706; text-align: left; font-size: 13px; border-radius: 8px;');
            mainMsgDiv.innerHTML = `
                <div style="font-weight: 800; color: #b45309; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; font-size: 14px;">
                    ⚠️ ĐANG TIẾN HÀNH SỬA ĐÁP ÁN TRỰC TUYẾN (${completedOverridesCount}/${unansweredList.length} CÂU)
                </div>
                <div style="color: #b45309; line-height: 1.5; font-weight: bold; margin-bottom: 8px;">
                    Đã sửa thành công ${completedOverridesCount} câu hỏi trực tuyến. Vẫn còn ${unansweredList.length - completedOverridesCount} câu chưa sửa.
                </div>
                <div style="font-size: 12px; color: var(--ink); line-height: 1.5; margin-bottom: 12px;">
                    👉 Thầy/Cô hãy hoàn thành nốt các câu còn lại để bộ đề trộn có bảng đáp án tổng hợp và mã QR đầy đủ, chính xác nhất!
                </div>
                <button id="btn-open-editor" class="btn btn-primary" style="width: 100%; border-radius: 0; padding: 10px; background: #d97706; border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); font-size: 13px; font-weight: 800; color: white; cursor: pointer;">
                    ✏️ TIẾP TỤC SỬA ĐÁP ÁN ONLINE TRỰC TIẾP
                </button>
            `;
        } else {
            mainMsgDiv.setAttribute('style', 'margin-top: 10px; padding: 14px; background: #fffbeb; border: 2px solid #d97706; box-shadow: 4px 4px 0 #d97706; text-align: left; font-size: 13px; border-radius: 8px;');
            mainMsgDiv.innerHTML = `
                <div style="font-weight: 800; color: #b45309; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; font-size: 14px;">
                    ⚠️ PHÁT HIỆN THIẾU ĐÁP ÁN ĐÚNG TRONG ĐỀ GỐC
                </div>
                <div style="color: #b45309; line-height: 1.5; font-weight: bold; margin-bottom: 8px;">
                    Kính gửi Thầy/Cô, hệ thống phát hiện một số câu hỏi dưới đây chưa có cấu hình đáp án đúng trong tệp Word gốc:
                </div>
                <div style="font-size: 12px; color: var(--ink); line-height: 1.5; margin-bottom: 12px;">
                    👉 Thầy/Cô có thể **sửa nhanh trực tuyến ngay trên web** bằng công cụ Sửa Đáp Án Online, hoặc chỉnh sửa trong tệp Word gốc và tải lên lại!
                </div>
                <button id="btn-open-editor" class="btn btn-primary" style="width: 100%; border-radius: 0; padding: 10px; background: #d97706; border: 2px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); font-size: 13px; font-weight: 800; color: white; cursor: pointer;">
                    ✏️ SỬA ĐÁP ÁN ONLINE TRỰC TIẾP
                </button>
            `;
        }

        const listDiv = document.createElement('div');
        listDiv.style.marginTop = '12px';
        listDiv.style.paddingLeft = '20px';
        unansweredList.forEach(q => {
            let statusText = '<span style="color: #dc2626; font-weight: bold;">(Chưa sửa)</span>';
            const key = q.part === 1 ? String(q.number) : q.part === 2 ? `p2_${q.number}` : `p3_${q.number}`;
            const val = answerOverrides[key];
            
            if (val !== undefined && val !== null && val !== "") {
                if (q.part === 2) {
                    if (val.a !== undefined && val.b !== undefined && val.c !== undefined && val.d !== undefined) {
                        statusText = '<span style="color: #10b981; font-weight: bold;">(Đã sửa online)</span>';
                    } else {
                        statusText = '<span style="color: #d97706; font-weight: bold;">(Đang sửa dở dang)</span>';
                    }
                } else {
                    statusText = '<span style="color: #10b981; font-weight: bold;">(Đã sửa online)</span>';
                }
            }
            
            const itemHtml = document.createElement('div');
            itemHtml.style.marginBottom = '6px';
            itemHtml.style.fontSize = '12px';
            itemHtml.innerHTML = `- Câu ${q.number} (Phần ${q.part}): ${q.type === 'choice' ? 'Thiếu đáp án gạch chân/tô đỏ' : (q.type === 'true_false' ? 'Thiếu đáp án đúng sai (Đ/S)' : 'Thiếu đáp án trả lời ngắn')} ${statusText}`;
            listDiv.appendChild(itemHtml);
        });
        mainMsgDiv.appendChild(listDiv);

        logConsole.appendChild(mainMsgDiv);
        logConsole.scrollTop = logConsole.scrollHeight;

        const btnOpenEditor = mainMsgDiv.querySelector('#btn-open-editor');
        if (btnOpenEditor) {
            btnOpenEditor.addEventListener('click', () => {
                openAnswerEditorModal(unansweredList);
            });
        }
    } else {
        const oldWarnings = logConsole.querySelectorAll('.validation-warning-log');
        oldWarnings.forEach(w => w.remove());

        const successDiv = document.createElement('div');
        successDiv.className = 'log-line validation-warning-log';
        successDiv.setAttribute('style', 'margin-top: 10px; padding: 14px; background: #ecfdf5; border: 2px solid #10b981; box-shadow: 4px 4px 0 #10b981; text-align: left; font-size: 13px; border-radius: 8px;');
        successDiv.innerHTML = `
            <div style="font-weight: 800; color: #047857; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; font-size: 14px;">
                🎉 ĐỀ GỐC HỢP LỆ
            </div>
            <div style="color: #047857; line-height: 1.5;">
                Tất cả câu hỏi trong các phần đều đầy đủ cấu hình đáp án đúng. Sẵn sàng tiến hành trộn đề!
            </div>
        `;
        logConsole.appendChild(successDiv);
        logConsole.scrollTop = logConsole.scrollHeight;

        if (outputPlaceholder) outputPlaceholder.style.display = "none";
    }
}
