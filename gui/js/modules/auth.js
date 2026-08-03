/**
 * Auth Module
 * Manages Firebase Auth state, user roles, profile UI updates, and unauthorized domain handling.
 */

import { addLog, showAlertDialog } from '../utils/ui-helpers.js';
import { loadAdminUsers } from './admin.js';

export let currentUser = null;
export let userRole = 'guest'; // guest, pending, 6_months, 1_year, lifetime, pro, admin
export let userData = null;
export let isActivated = false;

const isWebMode = true;

const OperationType = {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
};

export function handleFirestoreError(error, operationType, path) {
    const auth = window.firebaseAuth;
    const errInfo = {
        error: error instanceof Error ? error.message : String(error),
        authInfo: {
            userId: auth?.currentUser?.uid || null,
            email: auth?.currentUser?.email || null,
            emailVerified: auth?.currentUser?.emailVerified || null,
            isAnonymous: auth?.currentUser?.isAnonymous || null,
            tenantId: auth?.currentUser?.tenantId || null,
            providerInfo: auth?.currentUser?.providerData?.map(provider => ({
                providerId: provider.providerId,
                email: provider.email,
            })) || []
        },
        operationType,
        path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
}

export function showFirebaseDomainErrorModal() {
    let existingModal = document.getElementById('firebase-domain-error-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'firebase-domain-error-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.backgroundColor = 'rgba(11, 15, 25, 0.85)';
    modal.style.backdropFilter = 'blur(10px)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '999999';
    modal.style.fontFamily = 'var(--font-body)';

    const currentDomain = window.location.hostname;

    modal.innerHTML = `
        <div style="background: rgba(22, 30, 49, 0.98); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 16px; width: 560px; max-width: 90%; padding: 28px; box-shadow: var(--shadow-premium); text-align: left; color: white;">
            <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 20px;">
                <span style="font-size: 36px; line-height: 1;">⚠️</span>
                <div>
                    <h3 style="font-family: var(--font-heading); font-size: 20px; font-weight: 700; color: #f87171; margin: 0;">Lỗi xác thực Tên Miền Firebase</h3>
                    <p style="font-size: 13px; color: var(--text-secondary); margin: 4px 0 0 0;">(auth/unauthorized-domain)</p>
                </div>
            </div>
            
            <p style="font-size: 14px; line-height: 1.6; color: var(--text-primary); margin-bottom: 16px;">
                Do chính sách bảo mật, Firebase yêu cầu bạn phải thêm tên miền chạy ứng dụng hiện tại vào danh sách <strong>Authorized domains</strong> (Miền được ủy quyền) trước khi cho phép Đăng nhập Google.
            </p>

            <div style="background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 16px; margin-bottom: 20px; font-size: 13px; line-height: 1.6;">
                <strong style="color: #a78bfa; display: block; margin-bottom: 8px; font-size: 14px;">🛠️ Các bước xử lý nhanh:</strong>
                <ol style="margin-left: 20px; padding-left: 0; color: #e2e8f0; display: flex; flex-direction: column; gap: 6px;">
                    <li>Truy cập <a href="https://console.firebase.google.com/" target="_blank" style="color: #60a5fa; text-decoration: underline; font-weight: 600;">Firebase Console</a>.</li>
                    <li>Chọn dự án của bạn (ví dụ: <code style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: monospace; color: #facc15;">phmix-web</code>).</li>
                    <li>Vào menu bên trái: <strong>Authentication</strong> &rarr; Chọn tab <strong>Settings</strong> ở trên cùng &rarr; Chọn <strong>Authorized domains</strong>.</li>
                    <li>Nhấn nút <strong>Add domain</strong> (Thêm miền) rồi dán tên miền bên dưới vào:</li>
                </ol>
            </div>

            <div style="margin-bottom: 24px;">
                <label style="display: block; font-size: 11px; color: var(--text-secondary); font-weight: 600; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Tên miền cần sao chép:</label>
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="error-domain-input" readonly value="${currentDomain}" style="flex: 1; padding: 12px 14px; font-family: monospace; font-size: 14px; background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; color: #34d399; outline: none; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);">
                    <button id="btn-copy-error-domain" style="padding: 12px 18px; font-size: 13px; border-radius: 8px; background: linear-gradient(135deg, #8b5cf6 0%, #4f46e5 100%); border: none; color: white; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s;">
                        📋 Sao chép
                    </button>
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 20px;">
                <button id="btn-close-error-modal" style="padding: 10px 20px; font-size: 13px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); cursor: pointer; font-weight: 500;">
                    Đóng
                </button>
                <a href="https://console.firebase.google.com/" target="_blank" style="padding: 10px 20px; font-size: 13px; border-radius: 8px; background: #4f46e5; border: none; color: white; text-decoration: none; font-weight: 600; text-align: center; display: inline-flex; align-items: center; gap: 6px;">
                    Mở Firebase Console &rarr;
                </a>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const btnCopy = modal.querySelector('#btn-copy-error-domain');
    const btnClose = modal.querySelector('#btn-close-error-modal');
    const domainInput = modal.querySelector('#error-domain-input');

    btnCopy.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(domainInput.value);
            btnCopy.innerHTML = '✅ Đã chép';
            btnCopy.style.background = '#10b981';
            setTimeout(() => {
                btnCopy.innerHTML = '📋 Sao chép';
                btnCopy.style.background = 'linear-gradient(135deg, #8b5cf6 0%, #4f46e5 100%)';
            }, 2000);
        } catch (e) {
            showAlertDialog('Thông báo', 'Lỗi: Hãy bôi đen tên miền và sao chép thủ công.');
        }
    });

    btnClose.addEventListener('click', () => {
        modal.remove();
    });
}

export function updateUIForRole() {
    const trialBadge = document.getElementById('trial-badge');
    const adminTab = document.getElementById('tab-btn-admin');
    const userProfile = document.getElementById('user-profile');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    const userRoleBadge = document.getElementById('user-role-badge');
    const btnLogin = document.getElementById('btn-login');
    const numCodesInput = document.getElementById('num-codes');
    const codeStartInput = document.getElementById('code-start');
    
    const chkEnableMatrix = document.getElementById('chk-enable-matrix');
    const lblEnableMatrix = document.getElementById('lbl-enable-matrix');
    const matrixLoginHint = document.getElementById('matrix-login-hint');
    const matrixCardBody = document.getElementById('matrix-card-body');
    const classificationCard = document.getElementById('classification-card');

    if (currentUser) {
        if (chkEnableMatrix) {
            chkEnableMatrix.disabled = false;
            chkEnableMatrix.checked = true;
        }
        if (lblEnableMatrix) {
            lblEnableMatrix.style.opacity = '1';
            lblEnableMatrix.style.cursor = 'pointer';
            lblEnableMatrix.title = 'Bật/Tắt phân loại ma trận câu hỏi';
        }
        if (matrixLoginHint) {
            matrixLoginHint.style.display = 'none';
        }
        if (classificationCard) {
            classificationCard.style.opacity = '1';
        }
        if (matrixCardBody) {
            matrixCardBody.style.display = 'block';
        }
    } else {
        if (chkEnableMatrix) {
            chkEnableMatrix.disabled = true;
            chkEnableMatrix.checked = false;
        }
        if (lblEnableMatrix) {
            lblEnableMatrix.style.opacity = '0.6';
            lblEnableMatrix.style.cursor = 'not-allowed';
            lblEnableMatrix.title = 'Vui lòng đăng nhập để bật phân loại ma trận câu hỏi';
        }
        if (matrixLoginHint) {
            matrixLoginHint.style.display = 'inline';
        }
        if (classificationCard) {
            classificationCard.style.opacity = '0.7';
        }
        if (matrixCardBody) {
            matrixCardBody.style.display = 'none';
        }
    }
    
    let isExpired = false;
    if (userData && userData.expireAt) {
        const expireDate = new Date(userData.expireAt);
        if (expireDate < new Date()) {
            isExpired = true;
        }
    }
    
    if (currentUser) {
        if (btnLogin) btnLogin.style.display = 'none';
        if (userProfile) userProfile.style.display = 'flex';
        if (userAvatar) userAvatar.src = currentUser.photoURL || 'https://www.gstatic.com/images/branding/product/2x/avatar_anonymous_120dp.png';
        if (userName) userName.innerText = currentUser.displayName || currentUser.email;
        
        if (userRole === 'admin') {
            isActivated = true;
            if (userRoleBadge) {
                userRoleBadge.innerText = 'Admin';
                userRoleBadge.style.background = 'rgba(16, 185, 129, 0.2)';
                userRoleBadge.style.color = '#34d399';
                userRoleBadge.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            }
            if (adminTab) {
                adminTab.style.display = 'flex';
                adminTab.style.border = '1.5px dashed rgba(250, 204, 21, 0.7)';
                adminTab.style.color = '#facc15';
                adminTab.style.fontWeight = 'bold';
                adminTab.style.boxShadow = '0 0 12px rgba(250, 204, 21, 0.2)';
            }
            loadAdminUsers();
            addLog('🎉 Đăng nhập Admin thành công! Đã hiển thị và làm nổi bật Tab [🛡️ Quản Trị] ở thanh chọn tab phía bên trái.', 'success');
        } else if ((userRole === '6_months' || userRole === '1_year' || userRole === 'lifetime' || userRole === 'pro') && !isExpired) {
            isActivated = true;
            if (userRoleBadge) {
                let badgeText = 'Bản PRO';
                if (userRole === '6_months') badgeText = 'PRO 6 Tháng';
                else if (userRole === '1_year') badgeText = 'PRO 1 Năm';
                else if (userRole === 'lifetime') badgeText = 'PRO Trọn Đời';
                
                userRoleBadge.innerText = badgeText;
                userRoleBadge.style.background = 'rgba(139, 92, 246, 0.2)';
                userRoleBadge.style.color = '#a78bfa';
                userRoleBadge.style.border = '1px solid rgba(139, 92, 246, 0.4)';
            }
            if (adminTab) {
                adminTab.style.display = 'none';
                adminTab.style.border = '';
                adminTab.style.color = '';
                adminTab.style.fontWeight = '';
                adminTab.style.boxShadow = '';
            }
        } else {
            isActivated = false;
            if (userRoleBadge) {
                if (isExpired) {
                    userRoleBadge.innerText = 'Đã Hết Hạn';
                    userRoleBadge.style.background = 'rgba(239, 68, 68, 0.15)';
                    userRoleBadge.style.color = '#ef4444';
                    userRoleBadge.style.border = '1px solid rgba(239, 68, 68, 0.3)';
                } else {
                    userRoleBadge.innerText = 'Chờ Duyệt';
                    userRoleBadge.style.background = 'rgba(239, 68, 68, 0.1)';
                    userRoleBadge.style.color = '#f87171';
                    userRoleBadge.style.border = '1px solid rgba(239, 68, 68, 0.2)';
                }
            }
            if (adminTab) {
                adminTab.style.display = 'none';
                adminTab.style.border = '';
                adminTab.style.color = '';
                adminTab.style.fontWeight = '';
                adminTab.style.boxShadow = '';
            }
        }
    } else {
        if (btnLogin) btnLogin.style.display = 'block';
        if (userProfile) userProfile.style.display = 'none';
        if (adminTab) {
            adminTab.style.display = 'none';
            adminTab.style.border = '';
            adminTab.style.color = '';
            adminTab.style.fontWeight = '';
            adminTab.style.boxShadow = '';
        }
        isActivated = false;
    }

    const licenseStatus = document.getElementById('license-status-val');
    const licensePlan = document.getElementById('license-plan-val');
    const licenseExpiry = document.getElementById('license-expiry-val');
    const licenseDays = document.getElementById('license-days-val');

    if (isActivated) {
        if (trialBadge) trialBadge.style.display = 'none';
        if (numCodesInput) numCodesInput.disabled = false;
        if (codeStartInput) codeStartInput.disabled = false;
        if (licenseStatus) licenseStatus.innerText = 'Đã kích hoạt';
        
        let planText = 'pH-mix Web Pro';
        let expiryText = 'Vô hạn';
        let daysText = 'Vô hạn';
        
        if (userRole === '6_months') {
            planText = 'Gói 6 Tháng';
            if (userData && userData.expireAt) {
                expiryText = new Date(userData.expireAt).toLocaleDateString('vi-VN');
                const diffTime = new Date(userData.expireAt) - new Date();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                daysText = diffDays > 0 ? `${diffDays} ngày` : '0 ngày';
            } else {
                expiryText = '6 tháng kể từ ngày duyệt';
                daysText = 'Sử dụng 6 tháng';
            }
        } else if (userRole === '1_year') {
            planText = 'Gói 1 Năm';
            if (userData && userData.expireAt) {
                expiryText = new Date(userData.expireAt).toLocaleDateString('vi-VN');
                const diffTime = new Date(userData.expireAt) - new Date();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                daysText = diffDays > 0 ? `${diffDays} ngày` : '0 ngày';
            } else {
                expiryText = '1 năm kể từ ngày duyệt';
                daysText = 'Sử dụng 1 năm';
            }
        } else if (userRole === 'lifetime' || userRole === 'pro') {
            planText = 'Gói Trọn Đời';
            expiryText = 'Vĩnh viễn';
            daysText = 'Vô hạn';
        } else if (userRole === 'admin') {
            planText = 'Quản trị viên (Admin)';
            expiryText = 'Vĩnh viễn';
            daysText = 'Vô hạn';
        }
        
        if (licensePlan) licensePlan.innerText = planText;
        if (licenseExpiry) licenseExpiry.innerText = expiryText;
        if (licenseDays) licenseDays.innerText = daysText;
    } else {
        if (trialBadge) {
            trialBadge.style.display = 'inline';
            if (isExpired) {
                trialBadge.innerText = 'Tài khoản PRO đã hết hạn - Vui lòng gia hạn thêm thời gian sử dụng';
            } else if (userRole === 'pending') {
                trialBadge.innerText = 'Tài khoản chưa kích hoạt - Vui lòng chuyển khoản/liên hệ Admin';
            } else {
                trialBadge.innerText = 'Bản dùng thử - Giới hạn 2 mã';
            }
        }
        if (numCodesInput) { numCodesInput.value = 2; numCodesInput.disabled = true; }
        if (codeStartInput) { codeStartInput.value = 101; codeStartInput.disabled = true; }

        if (licenseStatus) licenseStatus.innerText = isExpired ? 'Đã hết hạn PRO' : (userRole === 'pending' ? 'Chờ duyệt kích hoạt' : 'Chưa kích hoạt');
        
        let planText = 'Dùng thử Web';
        let expiryText = '-';
        let daysText = '-';
        if (isExpired && userData && userData.expireAt) {
            if (userRole === '6_months') planText = 'Gói 6 Tháng (Đã hết hạn)';
            else if (userRole === '1_year') planText = 'Gói 1 Năm (Đã hết hạn)';
            else planText = 'Gói PRO (Đã hết hạn)';
            expiryText = new Date(userData.expireAt).toLocaleDateString('vi-VN');
            daysText = 'Hết hạn';
        }
        
        if (licensePlan) licensePlan.innerText = planText;
        if (licenseExpiry) licenseExpiry.innerText = expiryText;
        if (licenseDays) licenseDays.innerText = daysText;
        
        if (userRole === 'pending') {
            addLog('Tài khoản của bạn đang chờ duyệt. Vui lòng chuyển khoản tới tài khoản ở tab Giới thiệu và nhắn tin cho Zalo Admin để được kích hoạt Pro!', 'warning');
        } else if (isExpired) {
            addLog('Gói PRO của bạn đã hết hạn. Vui lòng thanh toán gia hạn và nhắn Zalo Admin để tiếp tục sử dụng trọn vẹn tính năng!', 'error');
        }
    }
}

export function initFirebase() {
    if (!isWebMode) return;
    if (window.firebaseInitialized) return;
    window.firebaseInitialized = true;

    const mainApp = document.getElementById('main-app');
    if (mainApp) mainApp.style.display = 'grid';

    const { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, doc, setDoc, getDoc, serverTimestamp } = window.firebaseAPI;
    const auth = window.firebaseAuth;
    const db = window.firebaseDb;

    const btnLogin = document.getElementById('btn-login');
    const btnLogout = document.getElementById('btn-logout');

    if (btnLogin) {
        btnLogin.addEventListener('click', async () => {
            const provider = new GoogleAuthProvider();
            try {
                await signInWithPopup(auth, provider);
            } catch (error) {
                console.error("Login error", error);
                if (error.code === 'auth/unauthorized-domain' || error.message.includes('unauthorized-domain')) {
                    showFirebaseDomainErrorModal();
                } else {
                    addLog('Lỗi đăng nhập: ' + error.message, 'error');
                }
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            await signOut(auth);
        });
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            if (btnLogin) btnLogin.style.display = 'none';
            
            userData = null;
            const userRef = doc(db, 'users', user.uid);
            
            try {
                let userSnap;
                try {
                    userSnap = await getDoc(userRef);
                } catch (error) {
                    if (error && String(error).includes("Token verification failed") && user) {
                        console.warn("Token verification failed during user fetch. Forcing token refresh...");
                        try {
                            await user.getIdToken(true);
                            userSnap = await getDoc(userRef);
                        } catch (retryErr) {
                            handleFirestoreError(retryErr, OperationType.GET, 'users/' + user.uid);
                        }
                    } else {
                        handleFirestoreError(error, OperationType.GET, 'users/' + user.uid);
                    }
                }
                
                if (!userSnap.exists()) {
                    // Hồ sơ tự tạo LUÔN ở trạng thái 'pending'. Việc nâng lên pro/admin
                    // chỉ do admin thực hiện — firestore.rules từ chối mọi giá trị khác.
                    const defaultStatus = 'pending';
                    const newUserPayload = {
                        email: user.email,
                        displayName: user.displayName || '',
                        status: defaultStatus,
                        createdAt: serverTimestamp()
                    };
                    
                    try {
                        await setDoc(userRef, newUserPayload);
                        const idToken = await user.getIdToken();
                        fetch('/api/notify-new-registration', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${idToken}`
                            },
                            body: JSON.stringify({
                                email: user.email,
                                displayName: user.displayName || '',
                                uid: user.uid,
                                status: defaultStatus
                            })
                        }).catch(err => console.error("Failed to notify admin of new registration:", err));
                    } catch (error) {
                        handleFirestoreError(error, OperationType.WRITE, 'users/' + user.uid);
                    }
                    
                    try {
                        userSnap = await getDoc(userRef);
                    } catch (error) {
                        handleFirestoreError(error, OperationType.GET, 'users/' + user.uid);
                    }
                }

                userData = userSnap.data();
            } catch (error) {
                console.error("Lỗi đồng bộ dữ liệu người dùng với Firestore:", error);
                addLog("Đồng bộ dữ liệu lỗi (sử dụng cấu hình cục bộ): " + error.message, "warning");
                userData = { status: 'pending', email: user.email };
            }

            userRole = (userData && userData.status) ? userData.status : 'pending';
            updateUIForRole();
        } else {
            currentUser = null;
            userRole = 'guest';
            if (btnLogin) btnLogin.style.display = 'block';
            updateUIForRole();
        }
    });
}
