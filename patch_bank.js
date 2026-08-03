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
            const res = await fetch('/api/parse-docx', { method: 'POST', body: formData });
            
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
