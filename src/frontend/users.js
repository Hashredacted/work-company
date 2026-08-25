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

window.goBackDashboard = function() {
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
  container.innerHTML = cachedPermissions.map(p => {
    const permString = `${p.resource}:${p.action}`;
    return `
      <label class="perm-item">
        <input type="checkbox" name="permissions" value="${permString}" />
        <div>
          <div style="font-weight: 600;">${permString}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${p.description}</div>
        </div>
      </label>
    `;
  }).join('');
}

// ─── Load Data ─────────────────────────────────────────────────────────────────
async function loadUsers() {
  try {
    const res = await fetch(`${API_BASE}/users`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to load users');
    const json = await res.json();
    const users = json.data.users;

    const tbody = document.getElementById('users-table-body');
    if (!users || users.length === 0) {
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
  }
}

async function loadRoles() {
  try {
    const [rolesRes, permRes] = await Promise.all([
      fetch(`${API_BASE}/roles`, { headers: authHeaders() }),
      fetch(`${API_BASE}/roles/permissions`, { headers: authHeaders() }),
    ]);

    if (!rolesRes.ok || !permRes.ok) throw new Error('Failed to load roles');

    const rolesJson = await rolesRes.json();
    const permJson = await permRes.json();

    cachedRoles = rolesJson.data;
    cachedPermissions = permJson.data;

    const tbody = document.getElementById('roles-table-body');
    tbody.innerHTML = cachedRoles.map(r => `
      <tr>
        <td style="font-weight: 600; color: var(--text);">${r.name}</td>
        <td><span style="font-size: 0.75rem; color: ${r.isSystemRole ? '#38bdf8' : '#a855f7'}; font-weight: 600;">${r.isSystemRole ? 'System Template' : 'Custom Workspace Role'}</span></td>
        <td>
          <div style="font-size: 0.78rem; color: var(--text-sub); max-width: 450px;">
            ${r.permissions.join(', ')}
          </div>
        </td>
        <td>
          ${!r.isSystemRole ? `<button class="action-btn" style="color: var(--error);" onclick="deleteCustomRole('${r._id}')">Delete</button>` : '<span style="font-size: 0.75rem; color: var(--text-muted);">Protected</span>'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
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
