/**
 * Main Entry Point for pH-mix Web Application
 * Orchestrates modules, tab navigation, and event bindings.
 */

import { addLog } from './utils/ui-helpers.js';
import { initFirebase } from './modules/auth.js';
import { bindAdminGlobalHandlers, loadAdminUsers } from './modules/admin.js';
import { 
    setSelectedWebFile, 
    validateFile, 
    parseAndRenderStage1Questions, 
    executeShuffle, 
    parsedQuestionsCache, 
    renderStage1MatrixList 
} from './modules/shuffle.js';
import { 
    loadQuestionBank, 
    loadSavedExams, 
    loadCustomCategories, 
    addManualQuestion, 
    renderQuestionBankList,
    importExamsToBank
} from './modules/bank.js';
import { 
    loadBuilderQuestions, 
    bindBuilderEventHandlers 
} from './modules/builder.js';

function setupTabNavigation() {
    const tabs = [
        { btn: 'tab-btn-shuffle', content: 'tab-content-shuffle' },
        { btn: 'tab-btn-bank', content: 'tab-content-bank' },
        { btn: 'tab-btn-builder', content: 'tab-content-builder' },
        { btn: 'tab-btn-about', content: 'tab-content-about' },
        { btn: 'tab-btn-admin', content: 'tab-content-admin' }
    ];

    tabs.forEach(t => {
        const btnEl = document.getElementById(t.btn);
        const contentEl = document.getElementById(t.content);
        if (btnEl && contentEl) {
            btnEl.addEventListener('click', () => {
                tabs.forEach(other => {
                    const b = document.getElementById(other.btn);
                    const c = document.getElementById(other.content);
                    if (b) b.classList.remove('active');
                    if (c) c.classList.remove('active');
                });
                btnEl.classList.add('active');
                contentEl.classList.add('active');

                if (t.btn === 'tab-btn-bank') {
                    loadQuestionBank();
                } else if (t.btn === 'tab-btn-builder') {
                    loadBuilderQuestions();
                } else if (t.btn === 'tab-btn-admin') {
                    loadAdminUsers();
                }
            });
        }
    });

    const bankSubtabs = [
        { btn: 'subtab-btn-questions', content: 'subtab-content-questions' },
        { btn: 'subtab-btn-exams', content: 'subtab-content-exams' },
        { btn: 'subtab-btn-tree', content: 'subtab-content-tree' }
    ];

    bankSubtabs.forEach(st => {
        const btnEl = document.getElementById(st.btn);
        const contentEl = document.getElementById(st.content);
        if (btnEl && contentEl) {
            btnEl.addEventListener('click', () => {
                bankSubtabs.forEach(other => {
                    const b = document.getElementById(other.btn);
                    const c = document.getElementById(other.content);
                    if (b) b.classList.remove('active');
                    if (c) {
                        c.classList.remove('active');
                        c.style.display = 'none';
                    }
                });
                btnEl.classList.add('active');
                contentEl.classList.add('active');
                contentEl.style.display = 'block';

                if (st.btn === 'subtab-btn-questions') {
                    loadQuestionBank();
                } else if (st.btn === 'subtab-btn-exams') {
                    loadSavedExams();
                } else if (st.btn === 'subtab-btn-tree') {
                    loadCustomCategories();
                }
            });
        }
    });
}

function setupFileInputs() {
    const selectFileBtn = document.getElementById('select-file-btn');
    const webFileInput = document.getElementById('web-file-input');
    const fileNameDisplay = document.getElementById('file-name-display');

    if (selectFileBtn && webFileInput) {
        selectFileBtn.addEventListener('click', () => {
            webFileInput.click();
        });

        webFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                const file = e.target.files[0];
                setSelectedWebFile(file);
                if (fileNameDisplay) fileNameDisplay.innerText = `📁 ${file.name}`;
                addLog(`Đã chọn tệp: "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`, 'info');
                
                validateFile(file);
                parseAndRenderStage1Questions(file);
            }
        });
    }

    const startShuffleBtn = document.getElementById('btn-start-shuffle');
    if (startShuffleBtn) {
        startShuffleBtn.addEventListener('click', executeShuffle);
    }

    const btnImportBank = document.getElementById('btn-import-exams-to-bank');
    const importFileInput = document.getElementById('bank-import-file-input');
    if (btnImportBank && importFileInput) {
        btnImportBank.addEventListener('click', () => {
            importFileInput.click();
        });
        importFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                importExamsToBank(e.target.files);
            }
            importFileInput.value = ''; // reset so we can select again
        });
    }
}

function setupMatrixBulkTagging() {
    const btnApplyBulk = document.getElementById('btn-apply-bulk-tag');
    if (btnApplyBulk) {
        btnApplyBulk.addEventListener('click', () => {
            const subject = document.getElementById('bulk-subject')?.value || 'Chưa phân loại';
            const grade = document.getElementById('bulk-grade')?.value || 'Chưa phân loại';
            const series = document.getElementById('bulk-series')?.value || 'Chưa phân loại';
            const chapter = document.getElementById('bulk-chapter')?.value || '';
            const lesson = document.getElementById('bulk-lesson')?.value || '';

            if (parsedQuestionsCache && parsedQuestionsCache.length > 0) {
                parsedQuestionsCache.forEach(q => {
                    if (!q.classification) q.classification = {};
                    if (subject !== 'Chưa phân loại') q.classification.subject = subject;
                    if (grade !== 'Chưa phân loại') q.classification.grade = grade;
                    if (series !== 'Chưa phân loại') q.classification.bookSeries = series;
                    if (chapter) q.classification.chapter = chapter;
                    if (lesson) q.classification.lesson = lesson;
                });
                renderStage1MatrixList();
                addLog('🏷️ Đã gắn nhãn ma trận đồng loạt thành công!', 'success');
            }
        });
    }
}

function setupBankFiltersAndActions() {
    const filterInputs = [
        'bank-search-q',
        'bank-filter-scope',
        'bank-filter-subject',
        'bank-filter-grade',
        'bank-filter-type',
        'bank-filter-difficulty'
    ];

    filterInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', renderQuestionBankList);
            if (id === 'bank-search-q') {
                el.addEventListener('input', renderQuestionBankList);
            }
        }
    });

    ['bank-filter-chapter', 'bank-filter-lesson'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', renderQuestionBankList);
        }
    });

    const btnAddManual = document.getElementById('btn-add-manual-q');
    if (btnAddManual) {
        btnAddManual.addEventListener('click', addManualQuestion);
    }
}

function initApp() {
    bindAdminGlobalHandlers();
    setupTabNavigation();
    setupFileInputs();
    setupMatrixBulkTagging();
    setupBankFiltersAndActions();
    bindBuilderEventHandlers();

    if (window.firebaseAuth && window.firebaseAPI) {
        initFirebase();
    } else {
        window.addEventListener('firebase-ready', () => {
            initFirebase();
        });
    }

    addLog('pH-mix Modular App Core Loaded Successfully!', 'success');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
