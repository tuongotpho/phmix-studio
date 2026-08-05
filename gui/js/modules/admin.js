/**
 * Admin Module
 * User management dashboard, role approval, revoking, deletion, and bulk operations.
 * v2 — Added stats panel, live search by email/name, filter by status.
 */

import { addLog, escapeHTML, showConfirmDialog, showAlertDialog, getAuthHeaders } from '../utils/ui-helpers.js';
import { userRole } from './auth.js';
import { isProStatus } from '../constants.js';

// Module-level cache of all loaded users (used for client-side search/filter)
let allUsersCache = [];

/**
 * Mọi thao tác quản trị đi qua API máy chủ (chạy Firebase Admin SDK), không ghi
 * Firestore trực tiếp nữa: security rules chỉ cho phép người dùng đọc/sửa hồ sơ của
 * chính mình, nên đường ghi trực tiếp trước đây luôn bị từ chối.
 */
async function adminApi(path, options = {}) {
    const extra = options.body ? { 'Content-Type': 'application/json' } : {};
    const res = await fetch(path, { ...options, headers: await getAuthHeaders(extra) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Máy chủ trả về lỗi ${res.status}`);
    return data;
}

/**
 * Renders the 4-card stats panel from the cached user list.
 */
function renderAdminStats(users) {
    const now = new Date();
    let pending = 0, pro = 0, expired = 0;

    users.forEach(u => {
        if (u.status === 'admin') return;
        if (isProStatus(u.status)) {
            if (u.expireAt && new Date(u.expireAt) < now) {
                expired++;
            } else {
                pro++;
            }
        } else {
            pending++;
        }
    });

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-total', users.length);
    set('stat-pending', pending);
    set('stat-pro', pro);
    set('stat-expired', expired);
}

/**
 * Filters the cached user list by search keyword and status dropdown, then re-renders.
 */
function applyFiltersAndRender() {
    const keyword = (document.getElementById('admin-search')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('admin-filter-status')?.value || '';
    const now = new Date();

    let filtered = allUsersCache.filter(u => {
        if (keyword) {
            const emailMatch = (u.email || '').toLowerCase().includes(keyword);
            const nameMatch = (u.displayName || '').toLowerCase().includes(keyword);
            if (!emailMatch && !nameMatch) return false;
        }
        if (statusFilter) {
            if (statusFilter === 'expired') {
                return isProStatus(u.status) && u.expireAt && new Date(u.expireAt) < now;
            }
            if (statusFilter === 'pending') {
                return !isProStatus(u.status) && u.status !== 'admin';
            }
            return u.status === statusFilter;
        }
        return true;
    });

    renderUserRows(filtered);
}

/**
 * Renders the user rows table from a filtered list.
 */
function renderUserRows(users) {
    const usersList = document.getElementById('admin-users-list');
    if (!usersList) return;
    const now = new Date();

    usersList.innerHTML = `
        <div class="admin-table-header">
            <div class="admin-header-col col-check">
                <input type="checkbox" id="admin-select-all" style="cursor: pointer; width: 16px; height: 16px;">
            </div>
            <div class="admin-header-col col-stt">STT</div>
            <div class="admin-header-col col-email">Email / Tên</div>
            <div class="admin-header-col col-goi">Gói &amp; Hạn</div>
            <div class="admin-header-col col-actions">Thao tác</div>
        </div>
    `;

    if (users.length === 0) {
        usersList.innerHTML += `<div class="admin-no-results">Không tìm thấy tài khoản phù hợp.</div>`;
        return;
    }

    users.forEach((data, index) => {
        const uid = data._uid;
        const el = window.document.createElement('div');
        el.className = 'admin-user-row';

        let roleName = 'Chờ duyệt';
        let roleClass = 'pending';
        if (data.status === '6_months') { roleName = '6 Tháng'; roleClass = 'months-6'; }
        else if (data.status === '1_year') { roleName = '1 Năm'; roleClass = 'year-1'; }
        else if (data.status === 'lifetime') { roleName = 'Trọn đời'; roleClass = 'lifetime'; }
        else if (data.status === 'pro' || data.status === 'active' || data.status === 'approved') { roleName = 'Bản PRO'; roleClass = 'pro'; }
        else if (data.status === 'admin') { roleName = 'Quản trị viên'; roleClass = 'admin'; }

        const isActivatedRole = isProStatus(data.status);

        let expiryHtml = '';
        if (data.expireAt) {
            const exp = new Date(data.expireAt);
            const expired = exp < now;
            expiryHtml = `<span class="admin-user-expiry" style="font-size: 10px; color: ${expired ? '#be123c' : '#4b5563'}; font-weight: 700;">
                ${expired ? '⚠️ ĐÃ HẾT HẠN' : `Hết hạn: ${exp.toLocaleDateString('vi-VN')}`}
            </span>`;
        }

        let subInfoHtml = '';
        if (data.createdAt) {
            const d = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            subInfoHtml = `<span class="admin-user-name">Tham gia: ${d.toLocaleDateString('vi-VN')}</span>`;
        } else if (data.displayName) {
            subInfoHtml = `<span class="admin-user-name">${escapeHTML(data.displayName)}</span>`;
        }

        const escapedUid = escapeHTML(uid);
        const escapedRoleClass = escapeHTML(roleClass);
        const escapedRoleName = escapeHTML(roleName);

        el.innerHTML = `
            <div class="admin-user-col col-check">
                ${data.status !== 'admin' ? `
                    <input type="checkbox" class="admin-user-checkbox" data-uid="${escapedUid}" style="cursor: pointer; width: 16px; height: 16px;">
                ` : `
                    <input type="checkbox" disabled style="cursor: not-allowed; opacity: 0.3; width: 16px; height: 16px;">
                `}
            </div>
            <div class="admin-user-col col-stt">
                <span class="admin-user-stt">${index + 1}</span>
            </div>
            <div class="admin-user-col col-email">
                <div class="admin-user-cell-email">
                    <span class="admin-user-email" title="${escapeHTML(data.email || 'No Email')}">${escapeHTML(data.email || 'No Email')}</span>
                    ${subInfoHtml}
                </div>
            </div>
            <div class="admin-user-col col-goi" style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                <span class="admin-user-role ${escapedRoleClass}">Gói: ${escapedRoleName}</span>
                ${expiryHtml}
            </div>
            <div class="admin-user-col col-actions">
                <div style="display: flex; gap: 6px; align-items: center; justify-content: flex-end; flex-shrink: 0; flex-wrap: nowrap;">
                    ${data.status !== 'admin' ? `
                        <button onclick="window.approveUser('${escapedUid}', '6_months')" class="admin-btn ${data.status === '6_months' ? 'active-6m' : ''}" title="Duyệt gói 6 tháng">6T</button>
                        <button onclick="window.approveUser('${escapedUid}', '1_year')" class="admin-btn ${data.status === '1_year' ? 'active-1y' : ''}" title="Duyệt gói 1 năm">1N</button>
                        <button onclick="window.approveUser('${escapedUid}', 'lifetime')" class="admin-btn ${data.status === 'lifetime' || data.status === 'pro' ? 'active-td' : ''}" title="Duyệt gói trọn đời">TĐ</button>
                    ` : ''}
                    ${isActivatedRole ? `
                        <button onclick="window.revokeUser('${escapedUid}')" class="admin-btn-revoke" title="Thu hồi quyền">Thu hồi</button>
                    ` : ''}
                    ${data.status !== 'admin' ? `
                        <button onclick="window.deleteUser('${escapedUid}')" class="admin-btn-delete" title="Xóa tài khoản">Xóa</button>
                    ` : ''}
                    ${data.status === 'admin' ? `<span class="admin-badge-admin">ADMIN</span>` : ''}
                </div>
            </div>
        `;
        usersList.appendChild(el);
    });

    // Checkbox logic
    function updateBulkActionsState() {
        const bulkPanel = document.getElementById('admin-bulk-actions');
        const countText = document.getElementById('selected-count-text');
        const selectAllCheckbox = document.getElementById('admin-select-all');
        if (!bulkPanel || !countText) return;
        const checkedBoxes = document.querySelectorAll('.admin-user-checkbox:checked');
        const totalBoxes = document.querySelectorAll('.admin-user-checkbox');
        bulkPanel.style.display = checkedBoxes.length > 0 ? 'flex' : 'none';
        countText.innerText = `Đã chọn: ${checkedBoxes.length} tài khoản`;
        if (selectAllCheckbox && totalBoxes.length > 0) {
            selectAllCheckbox.checked = checkedBoxes.length === totalBoxes.length;
            selectAllCheckbox.indeterminate = checkedBoxes.length > 0 && checkedBoxes.length < totalBoxes.length;
        }
    }

    const selectAllCheckbox = document.getElementById('admin-select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        selectAllCheckbox.onchange = () => {
            document.querySelectorAll('.admin-user-checkbox').forEach(cb => { cb.checked = selectAllCheckbox.checked; });
            updateBulkActionsState();
        };
    }
    document.querySelectorAll('.admin-user-checkbox').forEach(cb => { cb.onchange = () => updateBulkActionsState(); });

    const bulkDeleteBtn = document.getElementById('admin-bulk-delete-btn');
    if (bulkDeleteBtn) {
        bulkDeleteBtn.onclick = async () => {
            const checkedBoxes = document.querySelectorAll('.admin-user-checkbox:checked');
            if (checkedBoxes.length === 0) return;
            if (!await showConfirmDialog('Xác nhận xóa tài khoản', `Xóa ${checkedBoxes.length} tài khoản đã chọn? Thao tác này xóa cả tài khoản đăng nhập lẫn hồ sơ, và không thể hoàn tác.`)) return;
            addLog(`Bắt đầu xóa ${checkedBoxes.length} tài khoản...`, 'info');
            let successCount = 0, failCount = 0;
            for (const cb of checkedBoxes) {
                const uid = cb.getAttribute('data-uid');
                if (!uid) continue;
                try { await adminApi(`/api/admin/users/${encodeURIComponent(uid)}`, { method: 'DELETE' }); successCount++; }
                catch (err) { console.error(`Lỗi khi xóa tài khoản ${uid}:`, err); failCount++; }
            }
            if (successCount > 0) addLog(`Đã xóa thành công ${successCount} tài khoản!`, 'success');
            if (failCount > 0) addLog(`Không thể xóa ${failCount} tài khoản.`, 'error');
            loadAdminUsers();
        };
    }

    updateBulkActionsState();
}

export async function loadAdminUsers() {
    if (userRole !== 'admin') return;
    const usersList = document.getElementById('admin-users-list');
    if (!usersList) return;
    usersList.innerHTML = '<div style="padding: 16px; text-align: center; font-size: 13px; opacity: 0.6;">Đang tải...</div>';

    try {
        const data = await adminApi('/api/admin/users');
        allUsersCache = data.users || [];

        if (data.truncated) {
            addLog(`Danh sách bị cắt ở ${allUsersCache.length} tài khoản đầu tiên.`, 'warning');
        }

        renderAdminStats(allUsersCache);
        applyFiltersAndRender();
    } catch (err) {
        usersList.innerHTML = `<div style="padding: 16px; color: #dc2626;">Lỗi tải danh sách: ${escapeHTML(err.message)}</div>`;
    }
}

export function bindAdminGlobalHandlers() {
    // Live search
    const searchInput = document.getElementById('admin-search');
    if (searchInput) searchInput.addEventListener('input', () => applyFiltersAndRender());

    // Status filter
    const filterSelect = document.getElementById('admin-filter-status');
    if (filterSelect) filterSelect.addEventListener('change', () => applyFiltersAndRender());

    // Refresh button
    const refreshBtn = document.getElementById('admin-refresh-btn');
    if (refreshBtn) refreshBtn.onclick = () => loadAdminUsers();

    window.deleteUser = async (uid) => {
        if (userRole !== 'admin') return;
        const confirmed = await showConfirmDialog(
            'Xác nhận xóa tài khoản',
            'Thao tác này xóa cả tài khoản đăng nhập (Firebase Authentication) lẫn hồ sơ. Người dùng sẽ không thể đăng nhập lại. Không thể hoàn tác.'
        );
        if (!confirmed) return;
        try {
            await adminApi(`/api/admin/users/${encodeURIComponent(uid)}`, { method: 'DELETE' });
            addLog(`Đã xóa tài khoản có UID: ${uid} thành công!`, 'success');
            loadAdminUsers();
        } catch (e) { showAlertDialog('Lỗi', e.message); }
    };

    window.approveUser = async (uid, packageType) => {
        if (userRole !== 'admin') return;
        const packageNames = { '6_months': '6 Tháng', '1_year': '1 Năm', 'lifetime': 'Trọn Đời' };
        const planLabel = packageNames[packageType] || 'PRO';
        try {
            // Máy chủ tự tính hạn dùng và tự xử lý việc bấm lại đúng gói = thu hồi.
            const result = await adminApi(`/api/admin/users/${encodeURIComponent(uid)}/role`, {
                method: 'POST',
                body: JSON.stringify({ package: packageType })
            });
            if (result.revoked) {
                addLog('Đã thu hồi gói của người dùng này!', 'warning');
            } else {
                addLog(`Đã duyệt quyền ${planLabel} cho người dùng này!`, 'success');
            }
            loadAdminUsers();
        } catch (e) { showAlertDialog('Lỗi', e.message); }
    };

    window.revokeUser = async (uid) => {
        if (userRole !== 'admin') return;
        try {
            await adminApi(`/api/admin/users/${encodeURIComponent(uid)}/role`, {
                method: 'POST',
                body: JSON.stringify({ package: 'pending' })
            });
            addLog('Đã thu hồi quyền PRO của người dùng này!', 'warning');
            loadAdminUsers();
        } catch (e) { showAlertDialog('Lỗi', e.message); }
    };
}
