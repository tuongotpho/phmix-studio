/**
 * Bank Module
 * Question repository, matrix filter, saved exams, and custom curriculum tree handlers.
 */

import { addLog, renderSafeHTML, showAlertDialog, showConfirmDialog, showPromptDialog, uploadBase64ToStorage, renderMath, escapeHTML, getAuthHeaders } from '../utils/ui-helpers.js';
import { currentUser } from './auth.js';
import { parsedQuestionsCache } from './shuffle.js';

export let bankQuestionsCache = [];
export let bankSelectedIds = new Set();
export let bankCurrentPage = 1;

/**
 * @param {{ skipQuestions?: boolean }} [options] skipQuestions = true khi đề được
 *   lắp ráp từ chính Ngân hàng: chỉ ghi metadata đề thi, không chèn lại câu hỏi.
 */
export async function saveParsedQuestionsToBankAndExamMeta(file, numCodes, codeStart, options = {}) {
    if (!currentUser || !window.firebaseAPI || !window.firebaseDb) return;
    const chkEnableMatrix = document.getElementById('chk-enable-matrix');
    if (chkEnableMatrix && !chkEnableMatrix.checked) return;

    const skipQuestions = options.skipQuestions === true;

    const { addDoc, collection, serverTimestamp } = window.firebaseAPI;
    const db = window.firebaseDb;

    let savedCount = 0;
    const savedMessage = () => skipQuestions
        ? '💾 Đã lưu tệp đề thi vào Kho Ngân Hàng Cá Nhân (câu hỏi đã có sẵn, không lưu lại).'
        : `💾 Đã tự động lưu ${savedCount} câu hỏi & tệp đề thi vào Kho Ngân Hàng Cá Nhân!`;

    const doSave = async () => {
        savedCount = 0;

        if (skipQuestions) {
            addLog('ℹ️ Đề được lắp ráp từ Ngân hàng — bỏ qua bước lưu câu hỏi để tránh trùng lặp.', 'info');
        } else {
            addLog(`⏳ Đang tải ảnh lên Firebase Storage (nếu có)...`, 'info');
            for (const q of parsedQuestionsCache) {
                if (q.mediaItems && q.mediaItems.length > 0) {
                    for (const media of q.mediaItems) {
                        if (media.base64) {
                            try {
                                const ext = media.target ? media.target.split('.').pop() : 'png';
                                const url = await uploadBase64ToStorage(media.base64, ext);
                                media.url = url;

                                if (q.questionText) q.questionText = q.questionText.split(media.base64).join(url);
                                if (q.options) {
                                    q.options.forEach(opt => {
                                        if (opt.content) opt.content = opt.content.split(media.base64).join(url);
                                        if (opt.text) opt.text = opt.text.split(media.base64).join(url);
                                    });
                                }
                                if (q.statements) {
                                    q.statements.forEach(stmt => {
                                        if (stmt.content) stmt.content = stmt.content.split(media.base64).join(url);
                                        if (stmt.text) stmt.text = stmt.text.split(media.base64).join(url);
                                    });
                                }

                                delete media.base64;
                            } catch (err) {
                                console.error("Lỗi tải ảnh lên storage:", err);
                                addLog(`❌ Lỗi tải ảnh: ${err.message}`, 'error');
                                throw err;
                            }
                        }
                    }
                }
            }

            for (const q of parsedQuestionsCache) {
                let finalQText = q.questionText || '';
                finalQText = finalQText.replace(/^\s*Câu\s*\d+\s*[:.\-]?\s*/i, '').trim();

                await addDoc(collection(db, "questions"), {
                    ownerId: currentUser.uid,
                    ownerEmail: currentUser.email || '',
                    questionText: finalQText,
                    rawXmls: q.rawXmls || [],
                    mediaItems: q.mediaItems || [],
                    type: q.type || 'choice',
                    options: q.options || [],
                    statements: q.statements || [],
                    correctAnswer: q.correctAnswer || null,
                    classification: q.classification || {
                        subject: 'Chưa phân loại',
                        grade: 'Chưa phân loại',
                        chapter: 'Chưa phân loại',
                        lesson: 'Chưa phân loại',
                        difficulty: 'Chưa phân loại'
                    },
                    isPublic: false,
                    createdAt: serverTimestamp()
                });
                savedCount++;
            }
        }

        await addDoc(collection(db, "exams"), {
            ownerId: currentUser.uid,
            ownerEmail: currentUser.email || '',
            title: file ? file.name.replace('.docx', '') : 'Đề thi mới',
            questionCount: parsedQuestionsCache.length,
            numCodes: parseInt(numCodes, 10) || 4,
            codeStart: parseInt(codeStart, 10) || 1001,
            isPublic: false,
            createdAt: serverTimestamp()
        });
    };

    try {
        await doSave();
        addLog(`💾 Đã tự động lưu ${savedCount} câu hỏi & tệp đề thi vào Kho Ngân Hàng Cá Nhân!`, 'success');
    } catch (e) {
        if (e && String(e).includes("Token verification failed") && currentUser) {
            console.warn("Token verification failed on bank save. Refreshing token...");
            try {
                await currentUser.getIdToken(true);
                await doSave();
                addLog(savedMessage(), 'success');
                return;
            } catch (retryErr) {
                e = retryErr;
            }
        }
        console.error("Error saving questions to bank:", e);
        addLog(`Lỗi lưu vào Ngân Hàng: ${e.message}`, 'warning');
    }
}

export async function loadQuestionBank() {
    const container = document.getElementById('bank-questions-list');
    if (!container) return;

    if (!currentUser || !window.firebaseAPI || !window.firebaseDb) {
        container.innerHTML = '<div style="padding: 16px; text-align: center; color: #dc2626;">Vui lòng đăng nhập tài khoản để sử dụng Ngân Hàng Câu Hỏi!</div>';
        return;
    }

    container.innerHTML = '<div style="padding: 16px; text-align: center; font-size: 13px; opacity: 0.7;">Đang tải câu hỏi từ Ngân hàng...</div>';

    const { collection, getDocs, query, where } = window.firebaseAPI;
    const db = window.firebaseDb;

    try {
        const scopeFilter = document.getElementById('bank-filter-scope')?.value || 'private';
        let qRef = collection(db, "questions");
        let q;

        if (scopeFilter === 'public') {
            q = query(qRef, where("isPublic", "==", true));
        } else {
            q = query(qRef, where("ownerId", "==", currentUser.uid));
        }

        const snapshot = await getDocs(q);
        bankQuestionsCache = [];
        bankSelectedIds.clear();
        snapshot.forEach(docSnap => {
            bankQuestionsCache.push({ id: docSnap.id, ...docSnap.data() });
        });

        renderQuestionBankList();
    } catch (e) {
        console.error("Error loading question bank:", e);
        container.innerHTML = `<div style="padding: 16px; text-align: center; color: #dc2626;">Lỗi tải Ngân Hàng: ${e.message}</div>`;
    }
}

export function renderQuestionBankList(preservePage = false) {
    const container = document.getElementById('bank-questions-list');
    const countText = document.getElementById('bank-q-count-text');
    const chkSelectAll = document.getElementById('chk-bank-select-all');
    const btnDeleteSelected = document.getElementById('btn-bank-delete-selected');
    const selectedCountSpan = document.getElementById('bank-selected-count');

    if (!container) return;

    const keyword = document.getElementById('bank-search-q')?.value?.toLowerCase() || '';
    const subject = document.getElementById('bank-filter-subject')?.value || '';
    const grade = document.getElementById('bank-filter-grade')?.value || '';
    const chapter = document.getElementById('bank-filter-chapter')?.value?.toLowerCase().trim() || '';
    const lesson = document.getElementById('bank-filter-lesson')?.value?.toLowerCase().trim() || '';
    const qType = document.getElementById('bank-filter-type')?.value || '';
    const difficulty = document.getElementById('bank-filter-difficulty')?.value || '';

    let filtered = bankQuestionsCache.filter(q => {
        if (keyword && !q.questionText?.toLowerCase().includes(keyword)) return false;
        if (subject && q.classification?.subject !== subject) return false;
        if (grade && q.classification?.grade !== grade) return false;
        if (difficulty && q.classification?.difficulty !== difficulty) return false;
        if (chapter && !(q.classification?.chapter || '').toLowerCase().includes(chapter)) return false;
        if (lesson && !(q.classification?.lesson || '').toLowerCase().includes(lesson)) return false;
        if (qType) {
            const typeVal = q.type || 'choice';
            if (qType === 'choice' && typeVal !== 'choice' && typeVal !== 'mcq') return false;
            if (qType === 'true_false' && typeVal !== 'true_false' && typeVal !== 'tf' && typeVal !== 'tf_statement') return false;
            if (qType === 'short_answer' && typeVal !== 'short_answer' && typeVal !== 'short' && typeVal !== 'essay' && typeVal !== 'fill') return false;
        }
        return true;
    });

    if (countText) countText.innerText = `Đang hiển thị ${filtered.length} / ${bankQuestionsCache.length} câu hỏi`;

    if (selectedCountSpan) selectedCountSpan.innerText = bankSelectedIds.size;
    if (btnDeleteSelected) btnDeleteSelected.style.display = bankSelectedIds.size > 0 ? 'inline-flex' : 'none';
    if (chkSelectAll && filtered.length > 0) {
        const myFiltered = filtered.filter(q => q.ownerId === currentUser?.uid);
        chkSelectAll.checked = myFiltered.length > 0 && myFiltered.every(q => bankSelectedIds.has(q.id));
    }

    if (filtered.length === 0) {
        container.innerHTML = '<div style="padding: 16px; text-align: center; font-size: 13px; opacity: 0.7;">Không tìm thấy câu hỏi phù hợp.</div>';
        return;
    }

    // Pagination calculations
    if (!preservePage) bankCurrentPage = 1;
    const pageSize = 20;
    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    if (bankCurrentPage > totalPages) bankCurrentPage = totalPages;
    if (bankCurrentPage < 1) bankCurrentPage = 1;

    const startIndex = (bankCurrentPage - 1) * pageSize;
    const paginated = filtered.slice(startIndex, startIndex + pageSize);

    container.innerHTML = '';
    const { updateDoc, deleteDoc, doc } = window.firebaseAPI;
    const db = window.firebaseDb;

    paginated.forEach((q) => {
        const card = document.createElement('div');
        card.className = 'card bank-q-card';
        card.setAttribute('style', 'border: 1.5px solid var(--ink); padding: 10px; background: #fff; box-shadow: 2px 2px 0 var(--ink); display: flex; flex-direction: column; gap: 6px;');

        const diff = q.classification?.difficulty || 'Chưa phân loại';
        let diffBadgeColor = '#6b7280';
        if (diff === 'Nhận biết') diffBadgeColor = '#10b981';
        else if (diff === 'Thông hiểu') diffBadgeColor = '#3b82f6';
        else if (diff === 'Vận dụng') diffBadgeColor = '#f59e0b';
        else if (diff === 'Vận dụng cao') diffBadgeColor = '#ef4444';

        let typeLabel = 'Trắc nghiệm (4 PA)';
        let typeBg = '#e0e7ff';
        let typeColor = '#3730a3';
        const typeVal = q.type || 'choice';
        if (typeVal === 'true_false' || typeVal === 'tf' || typeVal === 'tf_statement') {
            typeLabel = 'Đúng / Sai (Mệnh đề)';
            typeBg = '#fef3c7';
            typeColor = '#92400e';
        } else if (typeVal === 'short_answer' || typeVal === 'short' || typeVal === 'essay' || typeVal === 'fill') {
            typeLabel = 'Tự luận / TL ngắn';
            typeBg = '#fce7f3';
            typeColor = '#9d174d';
        }

        const isMine = currentUser && q.ownerId === currentUser.uid;
        const isShared = !!q.isPublic;
        const isChecked = bankSelectedIds.has(q.id);

        let optionsHtml = '';
        if (q.options && q.options.length > 0) {
            optionsHtml = `<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; font-size: 11px; background: #f9fafb; padding: 6px; border-radius: 4px;">`;
            q.options.forEach(opt => {
                const isAns = opt.isCorrect || opt.id === q.correctAnswer;
                const letter = opt.letter || opt.id || '';
                const text = renderSafeHTML(opt.text || opt.content || '');
                optionsHtml += `<span style="${isAns ? 'font-weight: bold; color: #16a34a; text-decoration: underline;' : 'opacity: 0.8;'}">${letter}. ${text}</span>`;
            });
            optionsHtml += `</div>`;
        } else if (q.statements && q.statements.length > 0) {
            optionsHtml = `<div style="display: flex; flex-direction: column; gap: 2px; margin-top: 4px; font-size: 11px; background: #f9fafb; padding: 6px; border-radius: 4px;">`;
            q.statements.forEach(st => {
                const label = st.label || st.id || '';
                const text = renderSafeHTML(st.text || st.content || '');
                const isTrue = st.isCorrect !== undefined ? st.isCorrect : st.isTrue;
                optionsHtml += `<div style="display: flex; justify-content: space-between;"><span>${label}) ${text}</span> <strong style="color: ${isTrue ? '#16a34a' : '#dc2626'};">[${isTrue ? 'ĐÚNG' : 'SAI'}]</strong></div>`;
            });
            optionsHtml += `</div>`;
        } else if (q.correctAnswer) {
            optionsHtml = `<div style="margin-top: 4px; font-size: 11px; background: #ecfdf5; padding: 4px 8px; border-radius: 4px; color: #047857; font-weight: bold;">Đáp án: ${escapeHTML(q.correctAnswer)}</div>`;
        }

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                    ${isMine ? `<input type="checkbox" class="bank-q-chk" data-id="${q.id}" ${isChecked ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px; accent-color: var(--ink);">` : ''}
                    <span style="font-size: 10px; font-weight: bold; background: ${typeBg}; color: ${typeColor}; padding: 2px 6px; border-radius: 4px;">
                        ${typeLabel}
                    </span>
                    <span style="font-size: 10px; font-weight: bold; background: ${diffBadgeColor}; color: #fff; padding: 2px 6px; border-radius: 4px;">
                        ${diff === 'Chưa phân loại' ? '⚪ Chưa phân loại' : diff}
                    </span>
                    <span style="font-size: 11px; font-weight: bold; color: var(--ink);">Môn: ${escapeHTML(q.classification?.subject || 'Chưa phân loại')}</span>
                    <span style="font-size: 11px; opacity: 0.7;">Khối: ${escapeHTML(q.classification?.grade || 'Chưa phân loại')}</span>
                    ${q.classification?.chapter ? `<span style="font-size: 11px; font-weight: bold; color: #2563eb;">Chương: ${escapeHTML(q.classification.chapter)}</span>` : ''}
                    ${q.classification?.lesson ? `<span style="font-size: 11px; opacity: 0.8;">Bài: ${escapeHTML(q.classification.lesson)}</span>` : ''}
                </div>
                <div style="display: flex; gap: 6px; align-items: center;">
                    ${isMine ? `
                        <button class="btn btn-sm btn-edit-meta" style="font-size: 10px; padding: 2px 8px; background: #eff6ff; border: 1px solid #2563eb; color: #1d4ed8; cursor: pointer;">✏️ Sửa</button>
                        <button class="btn btn-sm btn-toggle-share" style="font-size: 10px; padding: 2px 8px; background: ${isShared ? '#ecfdf5' : '#f3f4f6'}; border: 1px solid var(--ink); cursor: pointer;">
                            ${isShared ? '🌐 Đang Chia Sẻ Group/Cộng Đồng' : '🔒 Kho Cá Nhân (Bật chia sẻ)'}
                        </button>
                        <button class="btn btn-sm btn-delete-q" style="font-size: 10px; padding: 2px 6px; background: #fee2e2; border: 1px solid #dc2626; color: #dc2626; cursor: pointer;">🗑️ Xóa</button>
                    ` : `<span style="font-size: 10px; background: #e0e7ff; padding: 2px 6px; border-radius: 4px;">🌐 Từ Cộng Đồng</span>`}
                </div>
            </div>
            <div style="font-size: 12px; color: var(--ink); line-height: 1.4; margin-top: 4px;">
                ${renderSafeHTML(q.questionText)}
            </div>
            ${optionsHtml}
        `;

        const chk = card.querySelector('.bank-q-chk');
        if (chk) {
            chk.addEventListener('change', (e) => {
                if (e.target.checked) {
                    bankSelectedIds.add(q.id);
                } else {
                    bankSelectedIds.delete(q.id);
                }
                if (selectedCountSpan) selectedCountSpan.innerText = bankSelectedIds.size;
                if (btnDeleteSelected) btnDeleteSelected.style.display = bankSelectedIds.size > 0 ? 'inline-flex' : 'none';
                if (chkSelectAll) {
                    const myFiltered = filtered.filter(item => item.ownerId === currentUser?.uid);
                    chkSelectAll.checked = myFiltered.length > 0 && myFiltered.every(item => bankSelectedIds.has(item.id));
                }
            });
        }

        // Edit metadata button
        const btnEdit = card.querySelector('.btn-edit-meta');
        if (btnEdit) {
            btnEdit.addEventListener('click', () => openMetadataEditor(q));
        }

        const btnShare = card.querySelector('.btn-toggle-share');
        if (btnShare) {
            btnShare.addEventListener('click', async () => {
                try {
                    const newShareState = !isShared;
                    await updateDoc(doc(db, "questions", q.id), { isPublic: newShareState });
                    q.isPublic = newShareState;
                    renderQuestionBankList(true);
                    addLog(newShareState ? '🌐 Đã bật chia sẻ câu hỏi cho Nhóm / Cộng đồng!' : '🔒 Đã chuyển câu hỏi về Kho Cá Nhân riêng tư!', 'success');
                } catch (err) {
                    showAlertDialog('Lỗi', "Lỗi cập nhật trạng thái chia sẻ: " + err.message);
                }
            });
        }

        const btnDelete = card.querySelector('.btn-delete-q');
        if (btnDelete) {
            btnDelete.addEventListener('click', async () => {
                if (await showConfirmDialog("Xác nhận xóa câu hỏi", "Thầy/Cô có chắc chắn muốn xóa câu hỏi này khỏi Ngân Hàng?")) {
                    try {
                        await deleteDoc(doc(db, "questions", q.id));
                        bankQuestionsCache = bankQuestionsCache.filter(item => item.id !== q.id);
                        bankSelectedIds.delete(q.id);
                        renderQuestionBankList(true);
                        addLog('🗑️ Đã xóa câu hỏi khỏi Ngân hàng!', 'info');
                    } catch (err) {
                        showAlertDialog('Lỗi', "Lỗi xóa câu hỏi: " + err.message);
                    }
                }
            });
        }

        container.appendChild(card);
    });

    // Render pagination controls if totalPages > 1
    if (totalPages > 1) {
        const paginator = document.createElement('div');
        paginator.className = 'pagination-controls';
        paginator.setAttribute('style', 'grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 16px; padding: 10px; background: #f9fafb; border: 1.5px solid var(--ink); box-shadow: 2px 2px 0 var(--ink);');
        paginator.innerHTML = `
            <button type="button" class="btn btn-secondary btn-sm" id="bank-prev-page" ${bankCurrentPage === 1 ? 'disabled' : ''} style="font-size: 11px; padding: 4px 10px; height: 28px;">◀ Trang trước</button>
            <span style="font-size: 12px; font-weight: bold; font-family: var(--font-mono);">Trang ${bankCurrentPage} / ${totalPages}</span>
            <button type="button" class="btn btn-secondary btn-sm" id="bank-next-page" ${bankCurrentPage === totalPages ? 'disabled' : ''} style="font-size: 11px; padding: 4px 10px; height: 28px;">Trang sau ▶</button>
        `;
        
        paginator.querySelector('#bank-prev-page').addEventListener('click', () => {
            if (bankCurrentPage > 1) {
                bankCurrentPage--;
                renderQuestionBankList(true);
                container.scrollTop = 0;
            }
        });
        paginator.querySelector('#bank-next-page').addEventListener('click', () => {
            if (bankCurrentPage < totalPages) {
                bankCurrentPage++;
                renderQuestionBankList(true);
                container.scrollTop = 0;
            }
        });
        container.appendChild(paginator);
    }
    
    renderMath();

    if (chkSelectAll) {
        chkSelectAll.onclick = (e) => {
            const myFiltered = filtered.filter(q => q.ownerId === currentUser?.uid);
            if (e.target.checked) {
                myFiltered.forEach(q => bankSelectedIds.add(q.id));
            } else {
                myFiltered.forEach(q => bankSelectedIds.delete(q.id));
            }
            renderQuestionBankList();
        };
    }

    if (btnDeleteSelected) {
        btnDeleteSelected.onclick = async () => {
            if (bankSelectedIds.size === 0) return;
            const count = bankSelectedIds.size;
            if (await showConfirmDialog("Xác nhận xóa hàng loạt", `Thầy/Cô có chắc chắn muốn xóa ${count} câu hỏi đã chọn khỏi Ngân Hàng?`)) {
                try {
                    const idsToDelete = Array.from(bankSelectedIds);
                    let deletedCount = 0;
                    for (const id of idsToDelete) {
                        await deleteDoc(doc(db, "questions", id));
                        deletedCount++;
                    }
                    bankQuestionsCache = bankQuestionsCache.filter(item => !bankSelectedIds.has(item.id));
                    bankSelectedIds.clear();
                    renderQuestionBankList();
                    addLog(`🗑️ Đã xóa thành công ${deletedCount} câu hỏi khỏi Ngân Hàng!`, 'success');
                } catch (err) {
                    showAlertDialog('Lỗi', "Lỗi khi xóa hàng loạt câu hỏi: " + err.message);
                }
            }
        };
    }
}

export async function loadSavedExams() {
    const container = document.getElementById('bank-exams-list');
    const countText = document.getElementById('bank-exams-count-text');
    if (!container) return;
    if (!currentUser || !window.firebaseAPI || !window.firebaseDb) {
        container.innerHTML = '<div style="padding: 16px; text-align: center; color: #dc2626;">Vui lòng đăng nhập!</div>';
        return;
    }

    const { collection, getDocs, query, where, deleteDoc, doc } = window.firebaseAPI;
    const db = window.firebaseDb;

    try {
        const q = query(collection(db, "exams"), where("ownerId", "==", currentUser.uid));
        const snapshot = await getDocs(q);
        const exams = [];
        snapshot.forEach(docSnap => exams.push({ id: docSnap.id, ...docSnap.data() }));

        if (countText) countText.innerText = `${exams.length} đề thi trong kho`;

        if (exams.length === 0) {
            container.innerHTML = '<div style="padding: 16px; text-align: center; font-size: 13px; opacity: 0.7;">Chưa có đề thi nào được lưu. Hãy xáo trộn đề để tự động lưu kho!</div>';
            return;
        }

        container.innerHTML = '';
        exams.forEach(ex => {
            const item = document.createElement('div');
            item.className = 'card';
            item.setAttribute('style', 'border: 1px solid var(--ink); padding: 10px; background: #fff; display: flex; justify-content: space-between; align-items: center;');
            item.innerHTML = `
                <div>
                    <div style="font-weight: bold; font-size: 13px; color: var(--ink);">${escapeHTML(ex.title || 'Đề thi không tên')}</div>
                    <div style="font-size: 11px; opacity: 0.7; margin-top: 2px;">
                        ${ex.questionCount || 0} câu hỏi &bull; ${ex.numCodes || 4} mã đề &bull; Tạo từ mã ${ex.codeStart || 1001}
                    </div>
                </div>
                <button class="btn btn-sm btn-delete-exam" style="font-size: 11px; background: #fee2e2; color: #dc2626; border: 1px solid #dc2626; cursor: pointer;">🗑️ Xóa</button>
            `;

            item.querySelector('.btn-delete-exam').addEventListener('click', async () => {
                if (await showConfirmDialog("Xác nhận xóa đề thi", "Xóa đề thi này khỏi kho lưu trữ?")) {
                    await deleteDoc(doc(db, "exams", ex.id));
                    loadSavedExams();
                }
            });

            container.appendChild(item);
        });
    } catch (e) {
        container.innerHTML = `<div style="padding: 16px; text-align: center; color: #dc2626;">Lỗi tải kho đề: ${e.message}</div>`;
    }
}

export async function loadCustomCategories() {
    const container = document.getElementById('custom-categories-list');
    if (!container) return;
    if (!currentUser || !window.firebaseAPI || !window.firebaseDb) return;

    const { collection, getDocs, query, where, deleteDoc, doc } = window.firebaseAPI;
    const db = window.firebaseDb;

    try {
        const q = query(collection(db, "curriculums"), where("ownerId", "==", currentUser.uid));
        const snapshot = await getDocs(q);
        const cats = [];
        snapshot.forEach(docSnap => cats.push({ id: docSnap.id, ...docSnap.data() }));

        if (cats.length === 0) {
            container.innerHTML = '<div style="font-size: 12px; opacity: 0.7;">Chưa có danh mục cá nhân nào. Thầy/Cô có thể tạo thêm ở ô bên cạnh!</div>';
            return;
        }

        container.innerHTML = '';
        cats.forEach(c => {
            const div = document.createElement('div');
            div.setAttribute('style', 'display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border: 1px dashed #ccc; font-size: 12px;');
            div.innerHTML = `
                <span>📁 [${escapeHTML(c.type || 'Custom')}] <strong>${escapeHTML(c.name)}</strong></span>
                <button class="btn-del-cat" style="color: #dc2626; border: none; background: none; cursor: pointer; font-size: 12px;">✖</button>
            `;
            div.querySelector('.btn-del-cat').addEventListener('click', async () => {
                await deleteDoc(doc(db, "curriculums", c.id));
                loadCustomCategories();
            });
            container.appendChild(div);
        });
    } catch (e) {
        console.error("Error loading categories:", e);
    }
}

export async function addManualQuestion() {
    if (!currentUser) { showAlertDialog('Thông báo', "Vui lòng đăng nhập!"); return; }
    const text = await showPromptDialog("Nhập nội dung câu hỏi mới:");
    if (!text || !text.trim()) return;
    const finalQText = text.replace(/^\s*Câu\s*\d+\s*[:.\-]?\s*/i, '').trim();
    const subj = await showPromptDialog("Nhập Môn học (VD: Vật lý):", "Vật lý") || "Chưa phân loại";
    const grade = await showPromptDialog("Nhập Khối lớp (VD: Lớp 10):", "Lớp 10") || "Chưa phân loại";
    
    const { addDoc, collection, serverTimestamp } = window.firebaseAPI;
    const db = window.firebaseDb;

    try {
        await addDoc(collection(db, "questions"), {
            ownerId: currentUser.uid,
            ownerEmail: currentUser.email || '',
            questionText: finalQText,
            type: 'choice',
            classification: {
                subject: subj,
                grade: grade,
                bookSeries: 'Chưa phân loại',
                chapter: 'Chưa phân loại',
                lesson: 'Chưa phân loại',
                difficulty: 'Chưa phân loại'
            },
            isPublic: false,
            createdAt: serverTimestamp()
        });
        addLog('➕ Đã thêm câu hỏi thủ công vào Ngân Hàng!', 'success');
        loadQuestionBank();
    } catch (err) {
        showAlertDialog('Lỗi', "Lỗi thêm câu hỏi: " + err.message);
    }
}
export async function importExamsToBank(files) {
    if (!currentUser || !window.firebaseAPI || !window.firebaseDb) {
        showAlertDialog('Lỗi', 'Vui lòng đăng nhập để sử dụng tính năng này.');
        return;
    }
    const maxFiles = 5;
    const filesArray = Array.from(files).slice(0, maxFiles);
    if (filesArray.length === 0) return;

    if (!await showConfirmDialog('Xác nhận nhập đề', `Thầy/Cô muốn trích xuất và nhập ${filesArray.length} đề thi vào Ngân hàng?`)) return;

    const { addDoc, collection, serverTimestamp } = window.firebaseAPI;
    const db = window.firebaseDb;
    const btnImport = document.getElementById('btn-import-exams-to-bank');
    
    if (btnImport) {
        btnImport.disabled = true;
        btnImport.innerText = 'Đang xử lý...';
    }

    let totalSaved = 0;
    
    try {
        for (let i = 0; i < filesArray.length; i++) {
            const file = filesArray[i];
            addLog(`⏳ Đang xử lý đề thi ${i + 1}/${filesArray.length}: ${file.name}...`, 'info');
            
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/parse-docx', { method: 'POST', headers: await getAuthHeaders(), body: formData });

            if (!res.ok) {
                addLog(`❌ Lỗi khi trích xuất đề thi ${file.name}`, 'error');
                continue;
            }
            
            const data = await res.json();
            if (data.success && Array.isArray(data.questions)) {
                let questions = data.questions;
                addLog(`Đã trích xuất ${questions.length} câu hỏi từ ${file.name}. Đang lưu vào Ngân hàng...`, 'info');
                
                // Upload images
                for (const q of questions) {
                    if (q.mediaItems && q.mediaItems.length > 0) {
                        for (const media of q.mediaItems) {
                            if (media.base64) {
                                try {
                                    const ext = media.target ? media.target.split('.').pop() : 'png';
                                    const url = await uploadBase64ToStorage(media.base64, ext);
                                    media.url = url;
                                    
                                    if (q.questionText) q.questionText = q.questionText.split(media.base64).join(url);
                                    if (q.options) {
                                        q.options.forEach(opt => {
                                            if (opt.content) opt.content = opt.content.split(media.base64).join(url);
                                            if (opt.text) opt.text = opt.text.split(media.base64).join(url);
                                        });
                                    }
                                    if (q.statements) {
                                        q.statements.forEach(stmt => {
                                            if (stmt.content) stmt.content = stmt.content.split(media.base64).join(url);
                                            if (stmt.text) stmt.text = stmt.text.split(media.base64).join(url);
                                        });
                                    }
                                    delete media.base64;
                                } catch (err) {
                                    console.error("Lỗi tải ảnh lên storage:", err);
                                }
                            }
                        }
                    }
                }
                
                // Save questions
                let savedCount = 0;
                for (const q of questions) {
                    let finalQText = q.questionText || '';
                    finalQText = finalQText.replace(/^\s*Câu\s*\d+\s*[:.\-]?\s*/i, '').trim();
                    
                    await addDoc(collection(db, "questions"), {
                        ownerId: currentUser.uid,
                        ownerEmail: currentUser.email || '',
                        questionText: finalQText,
                        rawXmls: q.rawXmls || [],
                        mediaItems: q.mediaItems || [],
                        type: q.type || 'choice',
                        options: q.options || [],
                        statements: q.statements || [],
                        correctAnswer: q.correctAnswer || null,
                        classification: q.classification || {
                            subject: 'Chưa phân loại',
                            grade: 'Chưa phân loại',
                            chapter: 'Chưa phân loại',
                            lesson: 'Chưa phân loại',
                            difficulty: 'Chưa phân loại'
                        },
                        isPublic: false,
                        createdAt: serverTimestamp()
                    });
                    savedCount++;
                    totalSaved++;
                }
                
                // Save exam
                await addDoc(collection(db, "exams"), {
                    ownerId: currentUser.uid,
                    ownerEmail: currentUser.email || '',
                    title: file.name.replace('.docx', ''),
                    questionCount: questions.length,
                    numCodes: 4,
                    codeStart: 101,
                    isPublic: false,
                    createdAt: serverTimestamp()
                });
                
                addLog(`✅ Đã nhập thành công ${savedCount} câu hỏi từ ${file.name}.`, 'success');
            }
        }
        
        addLog(`🎉 Hoàn tất! Đã lưu tổng cộng ${totalSaved} câu hỏi vào Ngân hàng.`, 'success');
        showAlertDialog('Thành công', `Đã nhập xong ${filesArray.length} đề thi với tổng cộng ${totalSaved} câu hỏi.`);
        renderQuestionBankList();
        loadSavedExams();
    } catch (e) {
        console.error(e);
        addLog(`❌ Lỗi khi nhập đề: ${e.message}`, 'error');
        showAlertDialog('Lỗi', `Đã xảy ra lỗi: ${e.message}`);
    } finally {
        if (btnImport) {
            btnImport.disabled = false;
            btnImport.innerText = '📥 Nhập đề lên kho';
        }
    }
}

/**
 * Opens the metadata editor modal for a given question object.
 * Prefills the form with existing classification data.
 * On save, updates Firestore and the local bankQuestionsCache.
 */
export function openMetadataEditor(q) {
    const modal = document.getElementById('metadata-editor-modal');
    if (!modal) return;

    // Prefill form fields
    const cls = q.classification || {};
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || 'Chưa phân loại'; };
    setVal('meta-subject', cls.subject);
    setVal('meta-grade', cls.grade);
    setVal('meta-difficulty', cls.difficulty);
    const chapterEl = document.getElementById('meta-chapter');
    const lessonEl = document.getElementById('meta-lesson');
    if (chapterEl) chapterEl.value = (cls.chapter && cls.chapter !== 'Chưa phân loại') ? cls.chapter : '';
    if (lessonEl) lessonEl.value = (cls.lesson && cls.lesson !== 'Chưa phân loại') ? cls.lesson : '';

    modal.style.display = 'flex';

    const close = () => { modal.style.display = 'none'; };

    // Close handlers
    document.getElementById('meta-modal-close-btn').onclick = close;
    document.getElementById('meta-modal-cancel-btn').onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };

    // Save handler
    const saveBtn = document.getElementById('meta-modal-save-btn');
    // Remove previous listener to avoid stacking
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    newSaveBtn.onclick = async () => {
        const newClassification = {
            subject: document.getElementById('meta-subject')?.value || 'Chưa phân loại',
            grade: document.getElementById('meta-grade')?.value || 'Chưa phân loại',
            difficulty: document.getElementById('meta-difficulty')?.value || 'Chưa phân loại',
            chapter: document.getElementById('meta-chapter')?.value?.trim() || 'Chưa phân loại',
            lesson: document.getElementById('meta-lesson')?.value?.trim() || 'Chưa phân loại',
        };

        newSaveBtn.disabled = true;
        newSaveBtn.textContent = 'Đang lưu...';

        try {
            const { updateDoc, doc } = window.firebaseAPI;
            const db = window.firebaseDb;
            await updateDoc(doc(db, 'questions', q.id), { classification: newClassification });

            // Update local cache so re-render reflects new values immediately
            q.classification = newClassification;
            const cacheIdx = bankQuestionsCache.findIndex(item => item.id === q.id);
            if (cacheIdx !== -1) bankQuestionsCache[cacheIdx].classification = newClassification;

            addLog(`✏️ Đã cập nhật phân loại câu hỏi: ${newClassification.subject} - ${newClassification.grade} - ${newClassification.difficulty}`, 'success');
            close();
            renderQuestionBankList(true);
        } catch (err) {
            showAlertDialog('Lỗi', 'Lỗi cập nhật phân loại: ' + err.message);
            newSaveBtn.disabled = false;
            newSaveBtn.textContent = '💾 Lưu phân loại';
        }
    };
}
