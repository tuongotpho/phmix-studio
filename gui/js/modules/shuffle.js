/**
 * Shuffle Module
 * File upload validation, matrix stage 1 extraction, and shuffle invocation logic.
 */

import { addLog, updateProgress, renderSafeHTML, renderMath, escapeHTML, getAuthHeaders } from '../utils/ui-helpers.js';
import { answerOverrides, resetAnswerOverrides, showValidationResults } from './answer-editor.js';
import { isActivated } from './auth.js';
import { saveParsedQuestionsToBankAndExamMeta } from './bank.js';

export let selectedWebFile = null;
export let isValidating = false;
export let cachedWarnings = [];
export let cachedUnansweredList = [];
export let parsedQuestionsCache = [];
export let lastUsedCodeStart = null;

export function setSelectedWebFile(file) {
    selectedWebFile = file;
}

export async function validateFile(file) {
    if (!file) return;
    const startBtn = document.getElementById('btn-start-shuffle');
    
    isValidating = true;
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.style.opacity = '0.5';
        startBtn.innerText = 'Đang phân tích đề... ⏳';
    }
    updateProgress(10, 'Đang phân tích cấu trúc và kiểm tra đáp án đề gốc...');
    addLog(`Đang gửi tệp "${file.name}" lên máy chủ để kiểm tra cấu trúc & đáp án...`, 'info');

    try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/validate', {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: formData
        });

        if (!res.ok) {
            const errJson = await res.json();
            throw new Error(errJson.error || 'Lỗi phân tích đề thi từ máy chủ.');
        }

        const data = await res.json();
        cachedWarnings = data.warnings || [];
        cachedUnansweredList = data.unanswered || [];

        showValidationResults(cachedUnansweredList);

        if (cachedUnansweredList.length > 0) {
            addLog(`Cảnh báo đề gốc: Phát hiện ${cachedUnansweredList.length} câu hỏi chưa hoàn thành đáp án đúng!`, 'warning');
            updateProgress(100, `Cảnh báo: Đề gốc thiếu ${cachedUnansweredList.length} đáp án!`);
        } else {
            addLog('Phân tích đề gốc hoàn tất: Đề thi hợp lệ, đầy đủ tất cả đáp án!', 'success');
            updateProgress(100, 'Đề gốc hợp lệ. Sẵn sàng trộn đề!');
        }
    } catch (err) {
        console.error(err);
        addLog(`Lỗi kiểm tra đề gốc: ${err.message}`, 'error');
        updateProgress(0, 'Không thể phân tích đề gốc');
        cachedWarnings = [];
        cachedUnansweredList = [];
    } finally {
        isValidating = false;
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
            startBtn.innerText = '🚀 BẮT ĐẦU TRỘN ĐỀ';
        }
    }
}

export async function parseAndRenderStage1Questions(file) {
    const classificationCard = document.getElementById('classification-card');
    const parsedCountBadge = document.getElementById('parsed-count-badge');
    const container = document.getElementById('parsed-questions-list');
    if (!classificationCard || !container) return;

    try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/parse-docx', { method: 'POST', headers: await getAuthHeaders(), body: formData });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.questions)) {
            parsedQuestionsCache = data.questions;
            classificationCard.style.display = 'block';
            if (parsedCountBadge) parsedCountBadge.innerText = `${parsedQuestionsCache.length} câu hỏi`;
            renderStage1MatrixList();
            addLog(`Đã trích xuất ${parsedQuestionsCache.length} câu hỏi cho bước Phân loại & Ma trận`, 'info');
        }
    } catch (e) {
        console.error("Error parsing docx questions for stage 1:", e);
    }
}

export function renderStage1MatrixList() {
    const container = document.getElementById('parsed-questions-list');
    if (!container) return;
    if (!parsedQuestionsCache || parsedQuestionsCache.length === 0) {
        container.innerHTML = '<div style="font-size: 12px; opacity: 0.7;">Không có câu hỏi nào...</div>';
        return;
    }

    container.innerHTML = '';
    parsedQuestionsCache.forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = 'stage1-q-item';
        item.setAttribute('style', 'border: 1px solid #e5e7eb; padding: 8px; border-radius: 4px; background: #fafafa; font-size: 12px;');

        const diff = q.classification?.difficulty || 'Chưa phân loại';

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                <div style="flex: 1;">
                    <span style="font-weight: bold; color: var(--ink);">Câu ${escapeHTML(q.number)} (${escapeHTML(q.partName)}):</span>
                    <div style="color: #374151; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${renderSafeHTML(q.questionText)}</div>
                    <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">
                        <span>Môn: <strong>${escapeHTML(q.classification?.subject || 'Chưa phân loại')}</strong></span> | 
                        <span>Khối: <strong>${escapeHTML(q.classification?.grade || 'Chưa phân loại')}</strong></span>
                    </div>
                </div>
                <div style="width: 140px; flex-shrink: 0;">
                    <label style="font-size: 10px; font-weight: bold; display: block; margin-bottom: 2px;">Mức độ ma trận:</label>
                    <select class="q-matrix-select" data-index="${idx}" style="width: 100%; font-size: 11px; padding: 2px 4px; border: 1px solid var(--ink);">
                        <option value="Chưa phân loại" ${diff === 'Chưa phân loại' ? 'selected' : ''}>⚪ Chưa phân loại</option>
                        <option value="Nhận biết" ${diff === 'Nhận biết' ? 'selected' : ''}>🟢 Nhận biết</option>
                        <option value="Thông hiểu" ${diff === 'Thông hiểu' ? 'selected' : ''}>🔵 Thông hiểu</option>
                        <option value="Vận dụng" ${diff === 'Vận dụng' ? 'selected' : ''}>🟠 Vận dụng</option>
                        <option value="Vận dụng cao" ${diff === 'Vận dụng cao' ? 'selected' : ''}>🔴 Vận dụng cao</option>
                    </select>
                </div>
            </div>
        `;
        container.appendChild(item);
    });

    container.querySelectorAll('.q-matrix-select').forEach(selectEl => {
        selectEl.addEventListener('change', (e) => {
            const i = parseInt(e.target.getAttribute('data-index'), 10);
            if (parsedQuestionsCache[i]) {
                parsedQuestionsCache[i].classification.difficulty = e.target.value;
            }
        });
    });
    renderMath();
}

export async function executeShuffle() {
    const startBtn = document.getElementById('btn-start-shuffle');
    const numCodesInput = document.getElementById('num-codes');
    const codeStartInput = document.getElementById('code-start');
    const optShuffleQ = document.getElementById('opt-shuffle-questions');
    const optShuffleC = document.getElementById('opt-shuffle-choices');
    const optShuffleS = document.getElementById('opt-shuffle-statements');
    const outputPlaceholder = document.getElementById('output-placeholder');
    const outputList = document.getElementById('output-list');

    if (!selectedWebFile) {
        addLog('Vui lòng chọn tệp đề gốc trước!', 'error');
        return;
    }

    if (isValidating) {
        addLog('Vui lòng đợi quá trình phân tích đề gốc hoàn tất!', 'warning');
        return;
    }

    let numCodes = parseInt(numCodesInput.value) || 4;
    let codeStart = parseInt(codeStartInput.value) || 101;

    if (numCodes > 48) {
        if (lastUsedCodeStart !== null) {
            if (codeStart === lastUsedCodeStart) {
                addLog('Lỗi: Khi trộn trên 48 mã đề, mã đề bắt đầu không được trùng với lần tạo trước (lần 1)! Vui lòng đổi sang mã bắt đầu khác.', 'error');
                updateProgress(0, 'Yêu cầu đổi mã đề');
                return;
            }
            const currentPrefix = String(codeStart).charAt(0);
            const lastPrefix = String(lastUsedCodeStart).charAt(0);
            if (currentPrefix === lastPrefix) {
                addLog(`Lỗi: Khi trộn trên 48 mã đề, mã đề bắt đầu phải chuyển sang đầu số khác (ký tự bắt đầu khác) so với lần 1 (${lastUsedCodeStart})!`, 'error');
                updateProgress(0, 'Yêu cầu đổi mã đề đầu số khác');
                return;
            }
        }
    }

    if (!isActivated) {
        numCodes = 2;
        if (numCodesInput) { numCodesInput.value = 2; numCodesInput.disabled = true; }
        if (codeStartInput) { codeStartInput.value = 101; codeStartInput.disabled = true; }
        addLog('Đang sử dụng bản dùng thử. Tính năng trộn đề bị giới hạn ở 2 mã.', 'warning');
    }

    const shuffleQ = optShuffleQ ? optShuffleQ.checked : true;
    const shuffleC = optShuffleC ? optShuffleC.checked : true;
    const shuffleS = optShuffleS ? optShuffleS.checked : true;

    updateProgress(0, 'Bắt đầu gửi dữ liệu...');
    if (outputPlaceholder) outputPlaceholder.style.display = "flex";
    if (outputList) {
        outputList.style.display = 'none';
        outputList.innerHTML = '';
    }

    if (startBtn) {
        startBtn.disabled = true;
        startBtn.style.opacity = '0.5';
    }

    try {
        addLog('Đang tải file lên server và thực hiện trộn đề...', 'info');

        let progress = 10;
        updateProgress(progress, 'Đang phân tích cấu trúc đề...');
        const progressInterval = setInterval(() => {
            if (progress < 90) {
                progress += 5;
                updateProgress(progress, 'Đang tiến hành đảo đề thi...');
            }
        }, 300);

        const formData = new FormData();
        formData.append('file', selectedWebFile);
        formData.append('num_codes', numCodes);
        formData.append('code_start', codeStart);
        formData.append('shuffle_questions', shuffleQ ? 'on' : 'off');
        formData.append('shuffle_choices', shuffleC ? 'on' : 'off');
        formData.append('shuffle_statements', shuffleS ? 'on' : 'off');
        formData.append('answer_overrides', JSON.stringify(answerOverrides));

        // X-User-Uid đã bị loại bỏ: backend lấy UID từ chữ ký token, không tin header.
        const headers = await getAuthHeaders();

        const response = await fetch('/api/shuffle', {
            method: 'POST',
            headers: headers,
            body: formData
        });

        clearInterval(progressInterval);

        if (!response.ok) {
            const errJson = await response.json();
            throw new Error(errJson.error || 'Lỗi server.');
        }

        addLog('Trộn đề hoàn tất! Đang tạo mã QR Code TNMaker tổng hợp...', 'info');
        addLog('Đang tải file zip kết quả...', 'success');
        updateProgress(100, 'Hoàn thành!');

        lastUsedCodeStart = codeStart;

        await saveParsedQuestionsToBankAndExamMeta(selectedWebFile, numCodes, codeStart);

        const blob = await response.blob();
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TronDe_${selectedWebFile.name.replace('.docx', '')}_ketqua.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        if (outputPlaceholder) outputPlaceholder.style.display = "none";
        if (outputList) {
            outputList.style.display = 'flex';
            outputList.innerHTML = '';

            const itemZip = document.createElement('div');
            itemZip.className = 'output-item';
            itemZip.setAttribute('style', 'cursor: pointer; padding: 12px; background: linear-gradient(135deg, rgba(124, 58, 237, 0.08) 0%, rgba(139, 92, 246, 0.12) 100%); border: 1.5px solid #7c3aed; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;');
            itemZip.innerHTML = `
                <div class="out-file-info" style="display: flex; align-items: center; gap: 8px;">
                    <span class="out-file-icon" style="font-size: 1.4rem;">📦</span>
                    <div style="display: flex; flex-direction: column; text-align: left;">
                        <span class="out-file-name" style="font-weight: bold; color: #7C3AED; font-size: 13px;" title="Tải .zip">TronDe_${selectedWebFile.name.replace('.docx', '')}_ketqua.zip</span>
                        <span style="font-size: 10px; opacity: 0.7;">Gói kết quả đầy đủ (Đã tự động tải)</span>
                    </div>
                </div>
                <span class="open-icon" style="background: #7C3AED; color: white; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: bold;">📥 Tải</span>
            `;
            itemZip.addEventListener('click', () => {
                const downloadUrl = window.URL.createObjectURL(blob);
                const dlLink = document.createElement('a');
                dlLink.href = downloadUrl;
                dlLink.download = `TronDe_${selectedWebFile.name.replace('.docx', '')}_ketqua.zip`;
                document.body.appendChild(dlLink);
                dlLink.click();
                dlLink.remove();
                window.URL.revokeObjectURL(downloadUrl);
                addLog('Đã tải lại tệp ZIP kết quả!', 'success');
            });
            outputList.appendChild(itemZip);
        }

        let completedOverridesCount = 0;
        if (Array.isArray(cachedUnansweredList)) {
            cachedUnansweredList.forEach(q => {
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
        }

        const remainingUnansweredCount = Array.isArray(cachedUnansweredList) ? (cachedUnansweredList.length - completedOverridesCount) : 0;

        if (remainingUnansweredCount > 0) {
            showValidationResults(cachedUnansweredList, true);
            addLog(`Cảnh báo nhập liệu đề gốc: Phát hiện ${remainingUnansweredCount} câu hỏi chưa hoàn thành đáp án đúng!`, 'warning');
        } else {
            const logConsole = document.getElementById('log-console');
            if (logConsole) {
                const li = document.createElement('div');
                li.className = 'log-line validation-warning-log';
                li.setAttribute('style', 'margin-top: 10px; padding: 12px; background: #ecfdf5; border: 1.5px solid #10b981; box-shadow: 2px 2px 0 #10b981; text-align: left; font-size: 13px; border-radius: 6px;');
                li.innerHTML = `
                    <div style="font-weight: bold; color: #047857; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        🎉 TRỘN ĐỀ THÀNH CÔNG!
                    </div>
                    <div style="color: #047857; line-height: 1.5; font-size: 12px;">
                        Đề thi đã được xáo trộn thành công sang ${numCodes} mã đề! Tất cả câu hỏi đều có đầy đủ cấu hình đáp án đúng.
                    </div>
                `;
                logConsole.appendChild(li);
                logConsole.scrollTop = logConsole.scrollHeight;
            }
        }

    } catch (err) {
        addLog(`Lỗi xử lý: ${err.message}`, 'error');
        updateProgress(0, 'Lỗi kết nối');
    } finally {
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.style.opacity = '1';
        }
    }
}
