'use strict';
const API_BASE = 'http://localhost:5000/api';
const token = localStorage.getItem('auth_token');
if (!token) window.location.href = 'index.html';

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

window.goBack = function () {
  const user = JSON.parse(localStorage.getItem('auth_user') || '{}');
  window.location.href = user.isSuperAdmin ? 'dashboard.html' : 'company-dashboard.html';
};

// ─── Load Profile ─────────────────────────────────────────────────────────────
async function loadProfile() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
    const json = await res.json();
    const user = json.data.user;

    const initials = user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('profile-avatar').textContent = initials;
    document.getElementById('profile-name').textContent = user.name;
    document.getElementById('profile-email').textContent = user.email;
    document.getElementById('new-name').value = user.name;

    const roleName = user.isSuperAdmin
      ? '⚡ Super Admin'
      : (user.role ? user.role.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'No Role');
    document.getElementById('profile-role').textContent = roleName;

    const perms = user.isSuperAdmin
      ? ['All Permissions']
      : (user.role ? user.role.permissions : []);

    const permsList = document.getElementById('perms-list');
    if (!perms || perms.length === 0) {
      permsList.innerHTML = '<span style="color:var(--text-muted);">No permissions assigned.</span>';
    } else {
      permsList.innerHTML = perms.map(p =>
        `<span class="perm-tag">${p === 'All Permissions' ? '⚡ All Permissions' : p}</span>`
      ).join('');
    }

    localStorage.setItem('auth_user', JSON.stringify({ ...user }));
  } catch (err) {
    console.error('Failed to load profile', err);
  }
}

// ─── Update Name ──────────────────────────────────────────────────────────────
window.updateName = async function (e) {
  e.preventDefault();
  const name = document.getElementById('new-name').value.trim();
  const btn = document.getElementById('name-btn');
  const errEl = document.getElementById('name-error');
  const sucEl = document.getElementById('name-success');

  errEl.style.display = 'none';
  sucEl.style.display = 'none';
  btn.textContent = 'Saving…';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    if (!res.ok) { errEl.textContent = json.message; errEl.style.display = 'block'; return; }

    sucEl.textContent = '✓ ' + json.message;
    sucEl.style.display = 'block';
    document.getElementById('profile-name').textContent = name;
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('profile-avatar').textContent = initials;
    setTimeout(() => { sucEl.style.display = 'none'; }, 3000);
  } catch (err) {
    errEl.textContent = 'Server error. Please try again.';
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Save Name';
    btn.disabled = false;
  }
};

// ─── Change Password ──────────────────────────────────────────────────────────
window.changePassword = async function (e) {
  e.preventDefault();
  const currentPassword = document.getElementById('cur-pwd').value;
  const newPassword = document.getElementById('new-pwd').value;
  const confirm = document.getElementById('confirm-pwd').value;
  const btn = document.getElementById('pwd-btn');
  const errEl = document.getElementById('pwd-error');
  const sucEl = document.getElementById('pwd-success');

  errEl.style.display = 'none';
  sucEl.style.display = 'none';

  if (newPassword !== confirm) {
    errEl.textContent = 'New passwords do not match.';
    errEl.style.display = 'block';
    return;
  }

  btn.textContent = 'Changing…';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const json = await res.json();
    if (!res.ok) { errEl.textContent = json.message; errEl.style.display = 'block'; return; }

    sucEl.textContent = '✓ ' + json.message;
    sucEl.style.display = 'block';
    document.getElementById('cur-pwd').value = '';
    document.getElementById('new-pwd').value = '';
    document.getElementById('confirm-pwd').value = '';
    setTimeout(() => { sucEl.style.display = 'none'; }, 4000);
  } catch (err) {
    errEl.textContent = 'Server error. Please try again.';
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Change Password';
    btn.disabled = false;
  }
};

// Init
loadProfile();
