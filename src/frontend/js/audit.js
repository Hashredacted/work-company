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

window.switchTab = function (tab) {
  ['activity', 'logins'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
    document.getElementById('section-' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'logins') loadLoginHistory();
};

// ─── Debounce ─────────────────────────────────────────────────────────────────
let debounceTimer;
window.debouncedLoad = function () {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadAuditLogs, 400);
};

// ─── Action color coding ──────────────────────────────────────────────────────
const ACTION_COLORS = {
  AUTH_LOGIN: { bg: 'rgba(56,189,248,0.15)', color: '#38bdf8' },
  AUTH_PASSWORD_RESET: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  AUTH_PASSWORD_CHANGED: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  USER_CREATE: { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
  USER_UPDATE: { bg: 'rgba(99,102,241,0.15)', color: '#a5b4fc' },
  USER_DELETE: { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  ROLE_CREATE: { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
  ROLE_UPDATE: { bg: 'rgba(99,102,241,0.15)', color: '#a5b4fc' },
  ROLE_DELETE: { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  SUBSCRIPTION_CREATED: { bg: 'rgba(34,197,94,0.15)', color: '#4ade80' },
  SUBSCRIPTION_CANCELLED: { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  DEFAULT: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
};

function actionBadge(action) {
  const c = ACTION_COLORS[action] || ACTION_COLORS.DEFAULT;
  return `<span class="action-badge" style="background:${c.bg};color:${c.color};">${action.replace(/_/g,' ')}</span>`;
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────
async function loadAuditLogs() {
  const tbody = document.getElementById('audit-tbody');
  const action = document.getElementById('filter-action').value.trim();
  const resource = document.getElementById('filter-resource').value;

  let url = `${API_BASE}/audit/logs?limit=100`;
  if (action) url += `&action=${encodeURIComponent(action)}`;
  if (resource) url += `&resource=${resource}`;

  try {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error('Unauthorized');
    const json = await res.json();
    const logs = json.data.logs;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">No audit logs found.</td></tr>';
      return;
    }

    tbody.innerHTML = logs.map((log, idx) => `
      <tr>
        <td style="text-align: center; color: var(--text-muted); font-weight: 700; font-size: 0.82rem;">${idx + 1}</td>
        <td>${actionBadge(log.action)}</td>
        <td style="color:var(--text-muted);">${log.resource || '—'}</td>
        <td style="font-weight:500;color:var(--text);">${log.userId ? (log.userId.name || log.userId) : '—'}</td>
        <td style="font-size:0.75rem;color:var(--text-muted);max-width:200px;word-break:break-all;">${log.details ? JSON.stringify(log.details).slice(0, 80) : '—'}</td>
        <td style="font-family:monospace;font-size:0.75rem;">${log.ip || '—'}</td>
        <td style="white-space:nowrap;">${new Date(log.createdAt).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--error);padding:24px;">${err.message === 'Unauthorized' ? 'You do not have permission to view audit logs.' : 'Failed to load audit logs.'}</td></tr>`;
  }
}

// ─── Login History ────────────────────────────────────────────────────────────
async function loadLoginHistory() {
  const tbody = document.getElementById('logins-tbody');
  try {
    const res = await fetch(`${API_BASE}/audit/login-history?limit=100`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Unauthorized');
    const json = await res.json();
    const history = json.data.history;

    if (!history || history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No login history found.</td></tr>';
      return;
    }

    tbody.innerHTML = history.map((h, idx) => `
      <tr>
        <td style="text-align: center; color: var(--text-muted); font-weight: 700; font-size: 0.82rem;">${idx + 1}</td>
        <td style="font-weight:600;color:var(--text);">${h.userId ? h.userId.name : '—'}</td>
        <td>${h.userId ? h.userId.email : '—'}</td>
        <td style="font-family:monospace;font-size:0.78rem;">${h.ip || '—'}</td>
        <td style="font-size:0.72rem;color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${h.userAgent || ''}">${h.userAgent ? h.userAgent.slice(0, 40) + '...' : '—'}</td>
        <td style="white-space:nowrap;">${new Date(h.loginAt).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--error);padding:24px;">${err.message === 'Unauthorized' ? 'You do not have permission to view login history.' : 'Failed to load login history.'}</td></tr>`;
  }
}

// Init
loadAuditLogs();
