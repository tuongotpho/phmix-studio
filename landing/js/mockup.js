/**
 * Interactive Mockup module for pH-mix Landing Page
 * Simulates test shuffling progress on the hero section mockup
 */

export function initMockup() {
    const mockupBtn = document.getElementById('mockup-shuffle-trigger');
    const mockupProgress = document.getElementById('mockup-progress-bar');
    if (!mockupBtn || !mockupProgress) return;

    const progressBarVal = mockupProgress.querySelector('.progress-bar-val');
    const progressLbl = mockupProgress.querySelector('.progress-lbl');

    mockupBtn.addEventListener('click', () => {
        mockupBtn.disabled = true;
        mockupBtn.innerText = '⏳ Đang trộn đề PRO...';
        mockupProgress.style.display = 'flex';
        
        if (progressBarVal) {
            progressBarVal.style.width = '0%';
            // Force layout reflow
            void progressBarVal.offsetHeight;
            progressBarVal.style.width = '100%';
        }
        
        if (progressLbl) {
            progressLbl.style.color = 'var(--success)';
            progressLbl.innerText = 'Đang phân tích cấu trúc đề thi 3 phần chuẩn Bộ GD&ĐT...';
            
            setTimeout(() => {
                progressLbl.innerText = 'Đang xáo trộn câu hỏi & phương án theo thuật toán tối ưu lề giấy...';
            }, 600);
            
            setTimeout(() => {
                progressLbl.innerText = 'Đang tự động xuất file Word căn lề, file đáp án Azota & Excel TNMaker...';
            }, 1200);
            
            setTimeout(() => {
                progressLbl.innerText = '🎉 Đã tạo thành công 4 đề! Đã xuất: Word Đề thi, Đáp án Azota, Excel TNMaker.';
                progressLbl.style.color = '#10b981';
                mockupBtn.disabled = false;
                mockupBtn.innerText = '⚡ BẮT ĐẦU TRỘN ĐỀ PRO';
            }, 1800);
        }
    });
}
