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

let cachedLogs = [];
let cachedLogins = [];

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
    const logs = json.data.logs || [];
    cachedLogs = logs;

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
    const history = json.data.history || [];
    cachedLogins = history;

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

function downloadAsXls(rows, filenamePrefix) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tbl = '<table border="1">' + rows.map((row, i) =>
    '<tr>' + row.map(c => i === 0
      ? `<th style="background:#1e3a5f;color:#fff;font-weight:bold;padding:5px 12px;white-space:nowrap;">${esc(c)}</th>`
      : `<td style="padding:4px 12px;">${esc(c)}</td>`
    ).join('') + '</tr>'
  ).join('') + '</table>';
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Export</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--><style>td,th{font-family:Calibri,Arial,sans-serif;font-size:11px;}tr:nth-child(even) td{background:#f0f4ff;}</style></head><body>${tbl}</body></html>`;
  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.xls`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getAuditRows() {
  const isActivityActive = document.getElementById('section-activity')?.classList.contains('active');
  const rows = [];

  if (isActivityActive) {
    if (!cachedLogs || cachedLogs.length === 0) return null;
    rows.push(['#', 'Action', 'Resource', 'User Name', 'Details', 'IP Address', 'Timestamp']);
    cachedLogs.forEach((l, idx) => {
      rows.push([
        idx + 1,
        l.action || '',
        l.resource || '',
        l.userId ? (l.userId.name || l.userId.email || l.userId) : '',
        l.details ? JSON.stringify(l.details) : '',
        l.ip || '',
        l.createdAt ? new Date(l.createdAt).toLocaleString('en-IN') : '',
      ]);
    });
  } else {
    if (!cachedLogins || cachedLogins.length === 0) return null;
    rows.push(['#', 'User Name', 'Email', 'IP Address', 'User Agent / Device', 'Login Timestamp']);
    cachedLogins.forEach((h, idx) => {
      rows.push([
        idx + 1,
        h.userId?.name || '',
        h.userId?.email || '',
        h.ip || '',
        h.userAgent || '',
        h.loginAt ? new Date(h.loginAt).toLocaleString('en-IN') : '',
      ]);
    });
  }
  return { rows, isActivityActive };
}

window.exportAuditToExcel = function () {
  const data = getAuditRows();
  if (!data) {
    alert('No audit/login records available to export.');
    return;
  }
  const filenamePrefix = `WorkSpace_${data.isActivityActive ? 'Activity_Logs' : 'Login_History'}`;
  downloadAsXls(data.rows, filenamePrefix);
};

window.previewAuditInBrowser = function () {
  const data = getAuditRows();
  if (!data) {
    alert('No audit/login records available to preview.');
    return;
  }
  const title = data.isActivityActive ? 'Activity Logs Audit Trail' : 'Login History Audit Trail';
  const filenamePrefix = `WorkSpace_${data.isActivityActive ? 'Activity_Logs' : 'Login_History'}`;
  if (typeof showSpreadsheetPreview === 'function') {
    showSpreadsheetPreview(data.rows, title, filenamePrefix);
  }
};

// Init
loadAuditLogs();
