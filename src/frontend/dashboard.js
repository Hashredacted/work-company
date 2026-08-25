'use strict';

const API_BASE = 'http://localhost:5000/api';

const token = localStorage.getItem('auth_token');
if (!token) {
  window.location.href = 'index.html';
}

// ─── DOM References ────────────────────────────────────────────────────────────
const userNameEl        = document.getElementById('user-name');
const avatarInitialEl   = document.getElementById('avatar-initial');
const logoutBtn         = document.getElementById('logout-btn');
const searchInput       = document.getElementById('search-input');
const statusFilter      = document.getElementById('status-filter');
const tableBody         = document.getElementById('company-table-body');

const kpiTotalEl    = document.getElementById('kpi-total');
const kpiActiveEl   = document.getElementById('kpi-active');
const kpiTrialEl    = document.getElementById('kpi-trial');
const kpiExpiringEl = document.getElementById('kpi-expiring');
const kpiExpiredEl  = document.getElementById('kpi-expired');
const kpiSuspendedEl= document.getElementById('kpi-suspended');

// ─── Headers helper ────────────────────────────────────────────────────────────
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// ─── Format Date ───────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
  }).format(new Date(iso));
}

// ─── Check Auth & Initialize ───────────────────────────────────────────────────
async function initDashboard() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Unauthorized');

    const json = await res.json();
    const user = json.data.user;

    if (!user.isSuperAdmin) {
      alert('Access restricted: Super Admin credentials required.');
      window.location.href = 'index.html';
      return;
    }

    userNameEl.textContent = user.name;
    avatarInitialEl.textContent = user.name.charAt(0).toUpperCase();

    // Fetch Stats & Companies
    await Promise.all([loadKPIStats(), loadCompanies()]);

  } catch (err) {
    console.error('Session error:', err);
    localStorage.removeItem('auth_token');
    window.location.href = 'index.html';
  }
}

// ─── Load KPI Stats ────────────────────────────────────────────────────────────
async function loadKPIStats() {
  try {
    const res = await fetch(`${API_BASE}/dashboard/stats`, { headers: authHeaders() });
    if (!res.ok) return;

    const json = await res.json();
    const { kpis } = json.data;

    kpiTotalEl.textContent     = kpis.totalCompanies || 0;
    kpiActiveEl.textContent    = kpis.activeCompanies || 0;
    kpiTrialEl.textContent     = kpis.trialCompanies || 0;
    kpiExpiringEl.textContent  = kpis.trialExpiringCompanies || 0;
    kpiExpiredEl.textContent   = kpis.trialExpiredCompanies || 0;
    kpiSuspendedEl.textContent = kpis.suspendedCompanies || 0;
  } catch (err) {
    console.error('Error fetching KPI metrics:', err);
  }
}

// ─── Load Companies List ───────────────────────────────────────────────────────
async function loadCompanies() {
  try {
    const search = searchInput.value.trim();
    const status = statusFilter.value;

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status', status);

    const res = await fetch(`${API_BASE}/companies?${params.toString()}`, { headers: authHeaders() });
    if (!res.ok) return;

    const json = await res.json();
    const companies = json.data.companies;

    renderTable(companies);
  } catch (err) {
    console.error('Error loading companies:', err);
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--error); padding: 24px;">Failed to load companies directory.</td></tr>`;
  }
}

// ─── Render Table Rows ─────────────────────────────────────────────────────────
function renderTable(companies) {
  if (!companies || companies.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 32px;">No companies found matching criteria.</td></tr>`;
    return;
  }

  tableBody.innerHTML = companies.map((c) => `
    <tr>
      <td>
        <div class="company-name">${c.name}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${c.gst ? 'GST: ' + c.gst : 'No GST'}</div>
      </td>
      <td>${c.email}</td>
      <td><span class="status-badge badge-${c.status}">${c.status}</span></td>
      <td>
        <div>${formatDate(c.createdAt)}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">
          ${c.status === 'TRIAL' ? 'Trial ends: ' + formatDate(c.trialEndsAt) : ''}
        </div>
      </td>
      <td>
        ${c.status !== 'ACTIVE' ? `<button class="action-btn btn-activate" onclick="changeStatus('${c._id}', 'ACTIVE')">Activate</button>` : ''}
        ${c.status !== 'SUSPENDED' ? `<button class="action-btn btn-suspend" onclick="changeStatus('${c._id}', 'SUSPENDED')">Suspend</button>` : ''}
      </td>
    </tr>
  `).join('');
}

// ─── Quick Status Change Action ────────────────────────────────────────────────
window.changeStatus = async function (companyId, newStatus) {
  if (!confirm(`Are you sure you want to change company status to ${newStatus}?`)) return;

  try {
    const res = await fetch(`${API_BASE}/companies/${companyId}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status: newStatus }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.message || 'Failed to update status');
      return;
    }

    // Refresh metrics & table
    await Promise.all([loadKPIStats(), loadCompanies()]);
  } catch (err) {
    console.error('Error changing status:', err);
    alert('Failed to connect to server');
  }
};

// ─── Events ───────────────────────────────────────────────────────────────────
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  window.location.href = 'index.html';
});

searchInput.addEventListener('input', debounce(loadCompanies, 300));
statusFilter.addEventListener('change', loadCompanies);

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Initialize
initDashboard();
