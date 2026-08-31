'use strict';
const API_BASE = 'http://localhost:5000/api';
const token = localStorage.getItem('auth_token');
if (!token) window.location.href = 'index.html';

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

let yearlyMode = false;
let currentPlanId = null;
let allPlans = [];

window.goBack = function () {
  const user = JSON.parse(localStorage.getItem('auth_user') || '{}');
  window.location.href = user.isSuperAdmin ? 'dashboard.html' : 'company-dashboard.html';
};

window.switchTab = function (tab) {
  ['plans', 'subscription', 'invoices'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
    document.getElementById('section-' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'subscription') loadSubscription();
  if (tab === 'invoices') loadInvoices();
};

window.toggleBillingCycle = function () {
  yearlyMode = !yearlyMode;
  document.getElementById('billing-toggle').classList.toggle('on', yearlyMode);
  renderPlans();
};

// ─── Load Plans ────────────────────────────────────────────────────────────────
async function loadPlans() {
  try {
    const res = await fetch(`${API_BASE}/billing/plans`);
    const json = await res.json();
    allPlans = json.data || [];

    // Get current subscription to know current plan
    const subRes = await fetch(`${API_BASE}/billing/subscription`, { headers: authHeaders() });
    if (subRes.ok) {
      const subJson = await subRes.json();
      currentPlanId = subJson.data.plan ? subJson.data.plan._id : null;
    }
    renderPlans();
  } catch (err) {
    document.getElementById('plans-grid').innerHTML = '<p style="color:var(--error);grid-column:1/-1;text-align:center;">Failed to load plans.</p>';
  }
}

function renderPlans() {
  const grid = document.getElementById('plans-grid');
  if (!allPlans.length) {
    grid.innerHTML = '<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">No plans available.</p>';
    return;
  }

  grid.innerHTML = allPlans.map(plan => {
    const price = yearlyMode ? plan.price.yearly : plan.price.monthly;
    const period = yearlyMode ? '/yr' : '/mo';
    const isCurrent = plan._id === currentPlanId;
    const isPopular = plan.name === 'pro';

    return `
      <div class="plan-card ${isCurrent ? 'current-plan' : ''} ${isPopular ? 'popular' : ''}">
        ${isPopular ? '<div class="plan-badge">Most Popular</div>' : ''}
        ${isCurrent ? '<div class="plan-badge" style="background:linear-gradient(135deg,#22c55e,#16a34a)">Current Plan</div>' : ''}
        <div class="plan-name">${plan.displayName}</div>
        <div class="plan-price">
          ${price === 0 ? 'Free' : `$${price}`}<span>${price > 0 ? period : ' forever'}</span>
        </div>
        <div class="plan-desc">${plan.description}</div>
        <ul class="plan-features">
          ${plan.features.map(f => `<li>${f}</li>`).join('')}
        </ul>
        <button class="plan-btn ${isCurrent ? 'plan-btn-current' : 'plan-btn-primary'}"
          onclick="${isCurrent ? '' : `subscribePlan('${plan._id}')`}"
          ${isCurrent ? 'disabled' : ''}>
          ${isCurrent ? '✓ Active Plan' : 'Subscribe Now'}
        </button>
      </div>
    `;
  }).join('');
}

// ─── Subscribe ─────────────────────────────────────────────────────────────────
window.subscribePlan = async function (planId) {
  if (!confirm('Subscribe to this plan? A simulated invoice will be generated.')) return;
  try {
    const res = await fetch(`${API_BASE}/billing/subscribe`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ planId, billingCycle: yearlyMode ? 'yearly' : 'monthly' }),
    });
    const json = await res.json();
    if (!res.ok) { alert(json.message); return; }
    alert('✅ ' + json.message);
    currentPlanId = json.data.plan._id;
    renderPlans();
  } catch (err) {
    alert('Server error. Please try again.');
  }
};

// ─── Load Subscription ─────────────────────────────────────────────────────────
async function loadSubscription() {
  const el = document.getElementById('sub-content');
  try {
    const res = await fetch(`${API_BASE}/billing/subscription`, { headers: authHeaders() });
    const json = await res.json();
    const { tenant, plan, subscription } = json.data;

    if (!plan || !subscription) {
      el.innerHTML = `
        <div style="text-align:center;padding:40px;">
          <div style="font-size:2rem;margin-bottom:12px;">📦</div>
          <h3 style="font-size:1.1rem;font-weight:700;">No Active Subscription</h3>
          <p style="color:var(--text-muted);font-size:0.875rem;margin:8px 0 18px;">You're on a free trial. Pick a plan to unlock full features.</p>
          <button class="btn-primary" style="width:auto;padding:10px 20px;" onclick="switchTab('plans')">View Plans →</button>
        </div>
      `;
      return;
    }

    const periodEnd = new Date(subscription.currentPeriodEnd).toLocaleDateString('en-IN', { dateStyle: 'medium' });
    el.innerHTML = `
      <div class="sub-status-card">
        <div>
          <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;font-weight:600;">Active Plan</div>
          <div style="font-size:1.5rem;font-weight:800;margin-top:4px;">${plan.displayName}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">Billing: ${subscription.billingCycle === 'yearly' ? 'Annual' : 'Monthly'} · Renews ${periodEnd}</div>
        </div>
        <div style="display:flex;gap:10px;">
          <button onclick="switchTab('plans')" style="background:var(--surface-2);border:1px solid var(--border);color:var(--text);padding:8px 14px;border-radius:6px;cursor:pointer;font-size:0.85rem;">Change Plan</button>
          <button onclick="cancelSub()" style="background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);color:#f87171;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:0.85rem;">Cancel</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">
        ${Object.entries(plan.limits).map(([k, v]) => `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;">
            <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;">${k.replace(/([A-Z])/g,' $1')}</div>
            <div style="font-size:1rem;font-weight:700;margin-top:4px;color:${v === true ? '#4ade80' : v === false ? '#f87171' : 'var(--text)'};">
              ${v === true ? '✓ Yes' : v === false ? '✗ No' : v === -1 ? 'Unlimited' : v}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    el.innerHTML = '<p style="color:var(--error);text-align:center;">Failed to load subscription.</p>';
  }
}

window.cancelSub = async function () {
  const reason = prompt('Why are you cancelling? (optional)');
  if (reason === null) return;
  try {
    const res = await fetch(`${API_BASE}/billing/cancel`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ reason }),
    });
    const json = await res.json();
    if (!res.ok) { alert(json.message); return; }
    alert('Subscription cancelled. Your access continues until the billing period ends.');
    loadSubscription();
  } catch (err) {
    alert('Server error.');
  }
};

let cachedInvoices = [];

// ─── Load Invoices ─────────────────────────────────────────────────────────────
async function loadInvoices() {
  const tbody = document.getElementById('invoices-tbody');
  try {
    const res = await fetch(`${API_BASE}/billing/invoices`, { headers: authHeaders() });
    const json = await res.json();
    const invoices = json.data?.invoices || [];
    cachedInvoices = invoices;

    if (!invoices || invoices.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">No invoices yet.</td></tr>';
      return;
    }

    const statusColor = { PAID: '#4ade80', UNPAID: '#fbbf24', VOID: '#94a3b8', DRAFT: '#94a3b8' };
    tbody.innerHTML = invoices.map((inv, idx) => `
      <tr>
        <td style="text-align:center;color:var(--text-muted);font-weight:700;font-size:0.82rem;">${idx + 1}</td>
        <td style="font-family:monospace;font-size:0.8rem;">${inv.invoiceNumber}</td>
        <td>${inv.lineItems && inv.lineItems[0] ? inv.lineItems[0].description : '—'}</td>
        <td style="font-weight:600;">$${inv.total?.toFixed(2)} <span style="font-size:0.7rem;color:var(--text-muted);">(incl. tax)</span></td>
        <td><span style="color:${statusColor[inv.status] || 'var(--text)'};font-size:0.75rem;font-weight:700;">${inv.status}</span></td>
        <td style="font-size:0.8rem;">${new Date(inv.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--error);">Failed to load invoices.</td></tr>';
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

function getInvoicesRows() {
  if (!cachedInvoices || cachedInvoices.length === 0) return null;
  const rows = [
    ['#', 'Invoice #', 'Description / Plan', 'Amount', 'Currency', 'Status', 'Invoice Date'],
  ];
  cachedInvoices.forEach((inv, idx) => {
    rows.push([
      idx + 1,
      inv.invoiceNumber || '',
      inv.lineItems && inv.lineItems[0] ? inv.lineItems[0].description : 'Subscription Plan',
      inv.total?.toFixed(2) || '0.00',
      inv.currency || 'USD',
      inv.status || '',
      inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-IN') : '',
    ]);
  });
  return rows;
}

window.exportInvoicesToExcel = function () {
  const rows = getInvoicesRows();
  if (!rows) { alert('No invoices available to export.'); return; }
  downloadAsXls(rows, 'WorkSpace_Invoices');
};

window.previewInvoicesInBrowser = function () {
  const rows = getInvoicesRows();
  if (!rows) { alert('No invoices available to preview.'); return; }
  if (typeof showSpreadsheetPreview === 'function') {
    showSpreadsheetPreview(rows, 'Invoice & Billing History', 'WorkSpace_Invoices');
  }
};

// Init
loadPlans();
