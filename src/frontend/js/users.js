'use strict';

const API_BASE = 'http://localhost:5000/api';
const token = localStorage.getItem('auth_token');
if (!token) window.location.href = 'index.html';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

window.goBackDashboard = function () {
  const user = JSON.parse(localStorage.getItem('auth_user') || '{}');
  if (user.isSuperAdmin || !user.tenantId) {
    window.location.href = 'dashboard.html';
  } else {
    window.location.href = 'company-dashboard.html';
  }
};

let cachedRoles = [];
let cachedPermissions = [];

// ─── Tab Switching ─────────────────────────────────────────────────────────────
window.switchTab = function (tab) {
  document.getElementById('tab-users').classList.toggle('active', tab === 'users');
  document.getElementById('tab-roles').classList.toggle('active', tab === 'roles');
  document.getElementById('section-users').classList.toggle('active', tab === 'users');
  document.getElementById('section-roles').classList.toggle('active', tab === 'roles');
};

// ─── Modals ────────────────────────────────────────────────────────────────────
window.closeModals = function () {
  document.getElementById('user-modal').hidden = true;
  document.getElementById('role-modal').hidden = true;
};

window.openAddUserModal = function () {
  document.getElementById('add-user-form').reset();
  document.getElementById('user-modal-error').hidden = true;
  populateRoleSelect();
  document.getElementById('user-modal').hidden = false;
};

window.openCreateRoleModal = function () {
  document.getElementById('create-role-form').reset();
  document.getElementById('role-modal-error').hidden = true;
  populatePermissionGrid();
  document.getElementById('role-modal').hidden = false;
};

function populateRoleSelect() {
  const select = document.getElementById('new-user-role');
  const user = JSON.parse(localStorage.getItem('auth_user') || '{}');

  // Filter out system administrative roles that cannot be created/assigned to regular team members
  const assignableRoles = cachedRoles.filter(r => {
    if (r.name === 'super_admin') return false; // Super admin cannot be created
    if (!user.isSuperAdmin && r.name === 'company_admin') return false; // Only lower roles for company users
    return true;
  });

  if (assignableRoles.length === 0) {
    select.innerHTML = '<option value="">No custom roles yet. Please create a role first in the "Roles & Permissions" tab!</option>';
    return;
  }

  select.innerHTML = '<option value="">Select a lower role...</option>' + assignableRoles.map(r => `
    <option value="${r._id}">${r.name} ${r.isSystemRole ? '(Default)' : '(Custom Workspace Role)'}</option>
  `).join('');
}

function populatePermissionGrid() {
  const container = document.getElementById('perm-checkboxes');
  if (!cachedPermissions || cachedPermissions.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;">No permissions available.</div>';
    return;
  }

  // Group permissions by resource
  const groups = {
    company: { title: '🏢 Company & Profile', items: [] },
    user: { title: '👥 Team & Users', items: [] },
    role: { title: '🛡️ Roles & Permissions', items: [] },
    billing: { title: '💳 Billing & Invoices', items: [] },
    subscription: { title: '📈 Subscription Management', items: [] },
    audit: { title: '🔍 Audit Logs', items: [] },
    inventory: { title: '📦 Inventory & GST Orders', items: [] },
  };

  cachedPermissions.forEach(p => {
    const key = p.resource || 'other';
    if (!groups[key]) groups[key] = { title: `⚙️ ${key.toUpperCase()}`, items: [] };
    groups[key].items.push(p);
  });

  let html = '';
  for (const [, grp] of Object.entries(groups)) {
    if (!grp.items.length) continue;
    html += `
      <div style="grid-column: 1 / -1; margin-top: 10px; margin-bottom: 4px; font-weight: 700; font-size: 0.8rem; color: #a5b4fc; border-bottom: 1px solid var(--border); padding-bottom: 4px;">
        ${grp.title}
      </div>
    `;
    grp.items.forEach(p => {
      const permString = `${p.resource}:${p.action}`;
      html += `
        <label class="perm-item" style="display: flex; align-items: flex-start; gap: 8px; background: var(--surface-2); padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border); cursor: pointer;">
          <input type="checkbox" name="permissions" value="${permString}" style="margin-top: 3px;" />
          <div>
            <div style="font-weight: 600; font-size: 0.82rem; font-family: monospace; color: var(--text);">${permString}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.2; margin-top: 2px;">${p.description}</div>
          </div>
        </label>
      `;
    });
  }
  container.innerHTML = html;
}

// ─── Load Data ─────────────────────────────────────────────────────────────────
async function loadUsers() {
  const tbody = document.getElementById('users-table-body');
  try {
    const res = await fetch(`${API_BASE}/users`, { headers: authHeaders() });
    if (!res.ok) {
      if (res.status === 403) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">You do not have permission to view workspace users.</td></tr>';
        return;
      }
      throw new Error('Failed to load users');
    }
    const json = await res.json();
    const users = json.data?.users || [];

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No team members found.</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(u => `
      <tr>
        <td style="font-weight: 600; color: var(--text);">${u.name}</td>
        <td>${u.email}</td>
        <td><span style="background: rgba(99,102,241,0.15); color: #a5b4fc; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">${u.roleId ? u.roleId.name : 'No Role'}</span></td>
        <td><span style="color: ${u.isActive ? '#4ade80' : '#f87171'}; font-weight: 600; font-size: 0.75rem;">${u.isActive ? 'ACTIVE' : 'INACTIVE'}</span></td>
        <td>
          <button class="action-btn" onclick="toggleUserStatus('${u._id}', ${!u.isActive})">${u.isActive ? 'Deactivate' : 'Activate'}</button>
          <button class="action-btn" style="color: var(--error);" onclick="removeUser('${u._id}')">Remove</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--error); padding: 24px;">Unable to load team members. Please refresh.</td></tr>';
  }
}

async function loadRoles() {
  const tbody = document.getElementById('roles-table-body');
  try {
    // 1. Fetch system permissions (always available)
    try {
      const permRes = await fetch(`${API_BASE}/roles/permissions`, { headers: authHeaders() });
      if (permRes.ok) {
        const permJson = await permRes.json();
        cachedPermissions = permJson.data || [];
      }
    } catch (e) {
      console.warn('Could not fetch permissions', e);
    }

    // 2. Fetch roles
    const rolesRes = await fetch(`${API_BASE}/roles`, { headers: authHeaders() });
    if (!rolesRes.ok) {
      if (rolesRes.status === 403) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">🛡️ View-only access: Only administrators can configure roles and permission policies.</td></tr>';
        return;
      }
      throw new Error('Failed to load roles');
    }

    const rolesJson = await rolesRes.json();
    cachedRoles = rolesJson.data || [];

    if (cachedRoles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">No roles configured.</td></tr>';
      return;
    }

    tbody.innerHTML = cachedRoles.map(r => `
      <tr>
        <td style="font-weight: 600; color: var(--text);">${r.name.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase())}</td>
        <td><span style="font-size: 0.75rem; color: ${r.isSystemRole ? '#38bdf8' : '#a855f7'}; font-weight: 600; background: ${r.isSystemRole ? 'rgba(56,189,248,0.1)' : 'rgba(168,85,247,0.1)'}; padding: 2px 8px; border-radius: 6px;">${r.isSystemRole ? 'System Template' : 'Custom Workspace Role'}</span></td>
        <td>
          <div style="font-size: 0.75rem; color: var(--text-sub); max-width: 520px; line-height: 1.5; display: flex; flex-wrap: wrap; gap: 4px;">
            ${r.permissions.map(p => `<span style="background:rgba(255,255,255,0.05);padding:1px 6px;border-radius:4px;font-family:monospace;">${p}</span>`).join('')}
          </div>
        </td>
        <td>
          ${!r.isSystemRole ? `<button class="action-btn" style="color: var(--error);" onclick="deleteCustomRole('${r._id}')">Delete</button>` : '<span style="font-size: 0.75rem; color: var(--text-muted);">Protected</span>'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--error); padding: 24px;">Failed to load roles. Please try again.</td></tr>';
  }
}

// ─── Actions ───────────────────────────────────────────────────────────────────
window.toggleUserStatus = async function (userId, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/users/${userId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ isActive: newStatus }),
    });
    if (!res.ok) throw new Error('Failed to update status');
    await loadUsers();
  } catch (err) {
    alert(err.message);
  }
};

window.removeUser = async function (userId) {
  if (!confirm('Are you sure you want to remove this team member?')) return;
  try {
    const res = await fetch(`${API_BASE}/users/${userId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const e = await res.json();
      alert(e.message || 'Failed to remove user');
      return;
    }
    await loadUsers();
  } catch (err) {
    alert(err.message);
  }
};

window.deleteCustomRole = async function (roleId) {
  if (!confirm('Are you sure you want to delete this custom role?')) return;
  try {
    const res = await fetch(`${API_BASE}/roles/${roleId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const e = await res.json();
      alert(e.message || 'Failed to delete role');
      return;
    }
    await loadRoles();
  } catch (err) {
    alert(err.message);
  }
};

// ─── Form Submissions ──────────────────────────────────────────────────────────
document.getElementById('add-user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('user-modal-error');
  errEl.hidden = true;

  const payload = {
    name: document.getElementById('new-user-name').value.trim(),
    email: document.getElementById('new-user-email').value.trim(),
    password: document.getElementById('new-user-password').value,
    roleId: document.getElementById('new-user-role').value,
  };

  try {
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      errEl.textContent = json.message || 'Failed to create member';
      errEl.hidden = false;
      return;
    }
    closeModals();
    await loadUsers();
  } catch (err) {
    errEl.textContent = 'Server connection error';
    errEl.hidden = false;
  }
});

document.getElementById('create-role-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('role-modal-error');
  errEl.hidden = true;

  const name = document.getElementById('new-role-name').value.trim();
  const checked = Array.from(document.querySelectorAll('#perm-checkboxes input:checked')).map(cb => cb.value);

  if (!name || checked.length === 0) {
    errEl.textContent = 'Role name and at least 1 permission are required.';
    errEl.hidden = false;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/roles`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, permissions: checked }),
    });
    const json = await res.json();
    if (!res.ok) {
      errEl.textContent = json.message || 'Failed to save role';
      errEl.hidden = false;
      return;
    }
    closeModals();
    await loadRoles();
  } catch (err) {
    errEl.textContent = 'Server connection error';
    errEl.hidden = false;
  }
});

// Initialize
(async function init() {
  await Promise.all([loadUsers(), loadRoles()]);
})();
