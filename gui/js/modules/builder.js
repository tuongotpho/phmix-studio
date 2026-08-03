import { addLog, renderSafeHTML, showAlertDialog, renderMath, getAuthHeaders } from '../utils/ui-helpers.js';
import { bankQuestionsCache } from './bank.js';

export let builderQuestions = [];
let builderSelectedIds = new Set();
let builderCurrentPage = 1;

export function loadBuilderQuestions() {
    renderFilteredBuilderQuestions();
}

function renderFilteredBuilderQuestions(preservePage = false) {
    const container = document.getElementById('builder-questions-list');
    const countText = document.getElementById('builder-selected-count');
    if (!container) return;
    
    if (countText) countText.innerText = builderSelectedIds.size;
    
    const subject = document.getElementById('builder-filter-subject')?.value || '';
    const grade = document.getElementById('builder-filter-grade')?.value || '';
    const chapter = document.getElementById('builder-filter-chapter')?.value.trim().toLowerCase() || '';
    const lesson = document.getElementById('builder-filter-lesson')?.value.trim().toLowerCase() || '';
    const type = document.getElementById('builder-filter-type')?.value || '';
    
    let filtered = bankQuestionsCache;
    if (subject) filtered = filtered.filter(q => q.classification?.subject === subject);
    if (grade) filtered = filtered.filter(q => q.classification?.grade === grade);
    if (chapter) filtered = filtered.filter(q => q.classification?.chapter?.toLowerCase().includes(chapter));
    if (lesson) filtered = filtered.filter(q => q.classification?.lesson?.toLowerCase().includes(lesson));
    if (type) filtered = filtered.filter(q => q.type === type);
    
    if (filtered.length === 0) {
        container.innerHTML = '<div style="padding: 16px; text-align: center; font-size: 13px; opacity: 0.7;">Không tìm thấy câu hỏi nào phù hợp với bộ lọc.</div>';
        return;
    }
    
    // Pagination calculations
    if (!preservePage) builderCurrentPage = 1;
    const pageSize = 20;
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (builderCurrentPage > totalPages) builderCurrentPage = totalPages;
    if (builderCurrentPage < 1) builderCurrentPage = 1;
    
    const startIndex = (builderCurrentPage - 1) * pageSize;
    const paginated = filtered.slice(startIndex, startIndex + pageSize);
    
    container.innerHTML = '';
    paginated.forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = 'card';
        item.setAttribute('style', 'border: 1px solid var(--ink); padding: 10px; background: #fff; margin-bottom: 8px;');
        
        const isChecked = builderSelectedIds.has(q.id) ? 'checked' : '';
        let typeLabel = q.type === 'choice' ? 'Nhiều lựa chọn' : (q.type === 'true_false' ? 'Đúng/Sai' : 'Trả lời ngắn');
        const questionIndex = startIndex + idx + 1;
        
        item.innerHTML = `
            <div style="display: flex; justify-content: flex-start; align-items: flex-start; gap: 8px;">
                <input type="checkbox" class="builder-q-checkbox" data-id="${q.id}" ${isChecked} style="margin-top: 4px;">
                <div style="flex: 1;">
                    <div style="font-weight: bold; font-size: 12px; margin-bottom: 4px; color: var(--accent);">Câu ${questionIndex} (${typeLabel}):</div>
                    <div style="font-size: 12px; line-height: 1.4;">${renderSafeHTML(q.questionText)}</div>
                </div>
            </div>
        `;
        
        item.querySelector('.builder-q-checkbox').addEventListener('change', (e) => {
            if (e.target.checked) {
                builderSelectedIds.add(q.id);
            } else {
                builderSelectedIds.delete(q.id);
            }
            if (countText) countText.innerText = builderSelectedIds.size;
            document.getElementById('btn-builder-download').disabled = true;
            document.getElementById('btn-builder-shuffle').disabled = true;
        });
        
        container.appendChild(item);
    });

    // Render pagination controls if totalPages > 1
    if (totalPages > 1) {
        const paginator = document.createElement('div');
        paginator.className = 'pagination-controls';
        paginator.setAttribute('style', 'grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 16px; padding: 10px; background: #f9fafb; border: 1.5px solid var(--ink); box-shadow: 2px 2px 0 var(--ink);');
        paginator.innerHTML = `
            <button type="button" class="btn btn-secondary btn-sm" id="builder-prev-page" ${builderCurrentPage === 1 ? 'disabled' : ''} style="font-size: 11px; padding: 4px 10px; height: 28px;">◀ Trang trước</button>
            <span style="font-size: 12px; font-weight: bold; font-family: var(--font-mono);">Trang ${builderCurrentPage} / ${totalPages}</span>
            <button type="button" class="btn btn-secondary btn-sm" id="builder-next-page" ${builderCurrentPage === totalPages ? 'disabled' : ''} style="font-size: 11px; padding: 4px 10px; height: 28px;">Trang sau ▶</button>
        `;
        
        paginator.querySelector('#builder-prev-page').addEventListener('click', () => {
            if (builderCurrentPage > 1) {
                builderCurrentPage--;
                renderFilteredBuilderQuestions(true);
                container.scrollTop = 0;
            }
        });
        paginator.querySelector('#builder-next-page').addEventListener('click', () => {
            if (builderCurrentPage < totalPages) {
                builderCurrentPage++;
                renderFilteredBuilderQuestions(true);
                container.scrollTop = 0;
            }
        });
        container.appendChild(paginator);
    }
    
    renderMath();
}

export function bindBuilderEventHandlers() {
    ['builder-filter-subject', 'builder-filter-grade', 'builder-filter-chapter', 'builder-filter-lesson', 'builder-filter-type'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', renderFilteredBuilderQuestions);
            el.addEventListener('input', renderFilteredBuilderQuestions);
        }
    });

    const btnSelectAll = document.getElementById('btn-builder-select-all');
    if (btnSelectAll) {
        btnSelectAll.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('.builder-q-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = true;
                builderSelectedIds.add(cb.getAttribute('data-id'));
            });
            const countText = document.getElementById('builder-selected-count');
            if (countText) countText.innerText = builderSelectedIds.size;
        });
    }

    const btnDeselectAll = document.getElementById('btn-builder-deselect-all');
    if (btnDeselectAll) {
        btnDeselectAll.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('.builder-q-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = false;
                builderSelectedIds.delete(cb.getAttribute('data-id'));
            });
            const countText = document.getElementById('builder-selected-count');
            if (countText) countText.innerText = builderSelectedIds.size;
        });
    }

    const btnConfirm = document.getElementById('btn-builder-confirm');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
            if (builderSelectedIds.size === 0) {
                showAlertDialog('Thông báo', "Vui lòng chọn ít nhất 1 câu hỏi!");
                return;
            }
            builderQuestions = bankQuestionsCache.filter(q => builderSelectedIds.has(q.id));
            document.getElementById('btn-builder-download').disabled = false;
            document.getElementById('btn-builder-shuffle').disabled = false;
            addLog(`✅ Đã chốt ${builderQuestions.length} câu hỏi để lắp ráp đề!`, 'success');
        });
    }

    const btnGenerateDocx = document.getElementById('btn-builder-download');
    if (btnGenerateDocx) {
        btnGenerateDocx.addEventListener('click', async () => {
            if (builderQuestions.length === 0) return;
            const title = document.getElementById('builder-exam-title')?.value || 'ĐỀ THI TỔNG HỢP';
            addLog(`📝 Đang khởi tạo tệp Word (.docx) từ ${builderQuestions.length} câu hỏi...`, 'info');
            try {
                const res = await fetch('/api/generate-base-docx', {
                    method: 'POST',
                    headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        title: title,
                        questions: builderQuestions
                    })
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Lỗi server khi tạo Word.');
                }
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${title.replace(/[\s\/]/g, '_')}_LapRap.docx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                addLog(`🎉 Đã xuất thành công file Word: ${title}_LapRap.docx!`, 'success');
            } catch (err) {
                showAlertDialog('Lỗi', "Lỗi xuất file Word: " + err.message);
            }
        });
    }

    const btnShuffleAfterBuild = document.getElementById('btn-builder-shuffle');
    if (btnShuffleAfterBuild) {
        btnShuffleAfterBuild.addEventListener('click', async () => {
            if (builderQuestions.length === 0) return;
            const title = document.getElementById('builder-exam-title')?.value || 'ĐỀ THI TỔNG HỢP';
            addLog(`⚡ Đang tạo file Word tạm để thực hiện Trộn Đề ngay...`, 'info');
            try {
                const res = await fetch('/api/generate-base-docx', {
                    method: 'POST',
                    headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        title: title,
                        questions: builderQuestions
                    })
                });
                if (!res.ok) throw new Error('Lỗi tạo file Word tạm');
                const blob = await res.blob();
                const tempFile = new File([blob], `${title}_LapRap.docx`, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
                
                const tabShuffleBtn = document.getElementById('tab-btn-shuffle');
                if (tabShuffleBtn) tabShuffleBtn.click();
                
                const fileNameDisplay = document.getElementById('file-name-display');
                if (fileNameDisplay) fileNameDisplay.innerText = `📁 ${tempFile.name}`;
                
                const numCodesEl = document.getElementById('builder-num-codes');
                const codeStartEl = document.getElementById('builder-code-start');
                const configCodes = document.getElementById('config-num-codes');
                const configStart = document.getElementById('config-code-start');
                if (configCodes && numCodesEl) configCodes.value = numCodesEl.value;
                if (configStart && codeStartEl) configStart.value = codeStartEl.value;

                import('./shuffle.js').then(shuffleModule => {
                    // Cờ fromBuilder: câu hỏi đã có sẵn trong Ngân hàng, đừng lưu lại lần nữa.
                    shuffleModule.setSelectedWebFile(tempFile, true);
                    shuffleModule.validateFile(tempFile);
                    shuffleModule.parseAndRenderStage1Questions(tempFile);
                });
            } catch (err) {
                showAlertDialog('Lỗi', "Lỗi chuẩn bị trộn đề: " + err.message);
            }
        });
    }
}
