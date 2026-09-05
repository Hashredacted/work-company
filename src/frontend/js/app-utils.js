/**
 * Workspace App Utilities Bundle
 * Unified, modular utility library for Indian Accounting SaaS.
 * Exposes window.AppUtils and backward-compatible global shortcuts.
 */
(function(root) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. API & NETWORK UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  function getApiBase() {
    if (typeof window === 'undefined') return '/api';
    const loc = window.location;
    if (loc.origin && (loc.origin.includes(':3000') || loc.origin.includes(':5500') || loc.protocol === 'file:')) {
      return 'http://localhost:5000/api';
    }
    return '/api';
  }

  function getHeaders(extraHeaders = {}) {
    const token = (typeof localStorage !== 'undefined')
      ? (localStorage.getItem('auth_token') || localStorage.getItem('token') || '')
      : '';
    const tenantId = (typeof localStorage !== 'undefined')
      ? (localStorage.getItem('selected_tenant_id') || localStorage.getItem('activeCompanyId') || '')
      : '';

    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
      ...extraHeaders,
    };
  }

  async function apiFetch(endpoint, options = {}) {
    const baseUrl = getApiBase();
    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const opts = {
      ...options,
      headers: getHeaders(options.headers || {}),
    };

    const res = await fetch(url, opts);
    if (res.status === 401) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }
      if (typeof window !== 'undefined' && !window.location.pathname.includes('index.html')) {
        window.location.href = 'index.html';
      }
    }
    return res;
  }

  // Normalized Entity Fetchers
  async function fetchProducts(params = {}) {
    try {
      const q = new URLSearchParams({ limit: 1000, ...params }).toString();
      const res = await apiFetch(`/inventory/products?${q}`);
      if (!res.ok) return [];
      const json = await res.json();
      const raw = json.data?.products || (Array.isArray(json.data) ? json.data : (json.data?.items || []));
      return Array.from(new Map(raw.map(p => [p._id, p])).values());
    } catch (e) {
      console.warn('fetchProducts error:', e);
      return [];
    }
  }

  async function fetchCustomers(params = {}) {
    try {
      const q = new URLSearchParams({ limit: 1000, ...params }).toString();
      const res = await apiFetch(`/inventory/customers?${q}`);
      if (!res.ok) return [];
      const json = await res.json();
      const raw = json.data?.items || (Array.isArray(json.data) ? json.data : []);
      return Array.from(new Map(raw.map(c => [c._id, c])).values());
    } catch (e) {
      console.warn('fetchCustomers error:', e);
      return [];
    }
  }

  async function fetchSuppliers(params = {}) {
    try {
      const q = new URLSearchParams({ limit: 1000, ...params }).toString();
      const res = await apiFetch(`/inventory/suppliers?${q}`);
      if (!res.ok) return [];
      const json = await res.json();
      const raw = json.data?.items || (Array.isArray(json.data) ? json.data : []);
      return Array.from(new Map(raw.map(s => [s._id, s])).values());
    } catch (e) {
      console.warn('fetchSuppliers error:', e);
      return [];
    }
  }

  async function fetchWarehouses(params = {}) {
    try {
      const q = new URLSearchParams(params).toString();
      const res = await apiFetch(`/inventory/warehouses${q ? `?${q}` : ''}`);
      if (!res.ok) return [];
      const json = await res.json();
      const raw = Array.isArray(json.data) ? json.data : (json.data?.items || []);
      return Array.from(new Map(raw.map(w => [w._id, w])).values());
    } catch (e) {
      console.warn('fetchWarehouses error:', e);
      return [];
    }
  }

  async function fetchCategories(params = {}) {
    try {
      const q = new URLSearchParams(params).toString();
      const res = await apiFetch(`/inventory/categories${q ? `?${q}` : ''}`);
      if (!res.ok) return [];
      const json = await res.json();
      const raw = Array.isArray(json.data) ? json.data : (json.data?.categories || []);
      return Array.from(new Map(raw.map(c => [c._id, c])).values());
    } catch (e) {
      console.warn('fetchCategories error:', e);
      return [];
    }
  }

  async function fetchBankAccounts(params = {}) {
    try {
      const q = new URLSearchParams(params).toString();
      const res = await apiFetch(`/inventory/finance/bank-accounts${q ? `?${q}` : ''}`);
      if (!res.ok) return [];
      const json = await res.json();
      const raw = Array.isArray(json.data) ? json.data : (json.data?.accounts || []);
      return Array.from(new Map(raw.map(b => [b._id, b])).values());
    } catch (e) {
      console.warn('fetchBankAccounts error:', e);
      return [];
    }
  }

  async function fetchCompanies() {
    try {
      const res = await apiFetch('/inventory/companies');
      if (!res.ok) return [];
      const json = await res.json();
      const raw = Array.isArray(json.data) ? json.data : (json.data?.companies || []);
      return Array.from(new Map(raw.map(c => [c._id, c])).values());
    } catch (e) {
      console.warn('fetchCompanies error:', e);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. FORMATTERS (CURRENCY, DATES, NUMBERS)
  // ═══════════════════════════════════════════════════════════════════════════

  function formatINR(val, options = {}) {
    const num = Number(val || 0);
    if (isNaN(num)) return '₹0';

    const maxDecimals = options.forceDecimals ? 2 : (options.decimals !== undefined ? options.decimals : (num % 1 !== 0 ? 2 : 0));
    const minDecimals = options.forceDecimals ? 2 : 0;

    const formatted = Math.abs(num).toLocaleString('en-IN', {
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: maxDecimals,
    });

    return num < 0 ? `-₹${formatted}` : `₹${formatted}`;
  }

  function inr(val, decimals) {
    return formatINR(val, decimals !== undefined ? { decimals } : {});
  }

  function formatDate(d, options = {}) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';

    const dateOptions = {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...(options.withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      ...options,
    };

    return dt.toLocaleDateString('en-IN', dateOptions);
  }

  function fmtDate(d) {
    return formatDate(d);
  }

  function formatNumber(val, decimals = 0) {
    const num = Number(val || 0);
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function formatMasked(str, visibleDigits = 4) {
    const s = String(str || '').trim();
    if (!s) return '—';
    if (s.length <= visibleDigits) return s;
    return `•••• ${s.slice(-visibleDigits)}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. DOM & UI HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function escHtml(str) {
    return escapeHtml(str);
  }

  function debounce(fn, delay = 300) {
    let timer = null;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function smartSearchMatch(text, query) {
    if (!query) return true;
    if (!text) return false;
    const t = String(text).toLowerCase();
    const q = String(query).toLowerCase().trim();
    if (!q) return true;
    if (t.includes(q)) return true;
    const words = t.split(/[\s\-_\/,\.]+/);
    return words.some(w => w.startsWith(q));
  }

  function showToast(msg, type = 'info', duration = 3500) {
    if (typeof document === 'undefined') return;

    let container = document.getElementById('app-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'app-toast-container';
      container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:380px;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `app-toast toast-${type}`;

    let icon = 'ℹ️';
    let borderColor = 'rgba(56, 189, 248, 0.4)';
    let bgColor = '#0f172a';
    if (type === 'success') {
      icon = '✅';
      borderColor = 'rgba(74, 222, 128, 0.4)';
    } else if (type === 'error') {
      icon = '⚠️';
      borderColor = 'rgba(248, 113, 113, 0.4)';
    } else if (type === 'warning') {
      icon = '🔔';
      borderColor = 'rgba(251, 191, 36, 0.4)';
    }

    toast.style.cssText = `
      display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:10px;
      background:${bgColor};border:1px solid ${borderColor};color:#f8fafc;
      font-size:0.85rem;font-weight:600;box-shadow:0 10px 25px rgba(0,0,0,0.5);
      pointer-events:auto;animation:toastSlideIn 0.25s ease forwards;transition:all 0.2s ease;
    `;
    toast.innerHTML = `<span>${icon}</span><span style="flex:1;">${escapeHtml(msg)}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  function downloadCSV(filename, rows = [], headers = []) {
    if (typeof window === 'undefined') return;

    const allRows = headers && headers.length ? [headers, ...rows] : rows;
    const csvContent = allRows.map(r => {
      return r.map(cell => {
        const val = cell === null || cell === undefined ? '' : String(cell);
        return `"${val.replace(/"/g, '""')}"`;
      }).join(',');
    }).join('\r\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function printContent(title, htmlContent) {
    if (typeof window === 'undefined') return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
      alert('Please allow popups to print documents.');
      return;
    }
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #111; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #ddd; padding: 8px 12px; font-size: 13px; text-align: left; }
          th { background: #f4f4f5; font-weight: 700; }
          h2 { margin: 0 0 4px 0; }
          .sub { color: #666; font-size: 12px; margin-bottom: 16px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h2>${escapeHtml(title)}</h2>
        <div class="sub">Generated on ${new Date().toLocaleString('en-IN')}</div>
        ${htmlContent}
      </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 350);
  }

  function openModal(modalId) {
    const el = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (el) {
      el.classList.add('show');
      el.style.display = 'flex';
    }
  }

  function closeModal(modalId) {
    const el = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (el) {
      el.classList.remove('show');
      el.style.display = 'none';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. REFERENCE GENERATOR
  // ═══════════════════════════════════════════════════════════════════════════

  function generateSmartRef(mode, category = '') {
    const rand6 = Math.floor(100000 + Math.random() * 900000);
    const rand12 = Math.floor(100000000000 + Math.random() * 900000000000);
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datePrefix = `${yy}${mm}${dd}`;

    if (category === 'CASH_DEPOSIT_BANK') return `DEP-SLIP-${rand6}`;
    if (category === 'CASH_WITHDRAWAL_BANK') return `CHQ-${rand6}`;
    if (category === 'INTER_BANK_TRANSFER') return `IMPS-${rand12}`;

    const cleanMode = (mode || '').toUpperCase().trim();
    switch (cleanMode) {
      case 'UPI':
        return `UPI/${rand12}`;
      case 'NEFT_RTGS':
      case 'NEFT':
      case 'RTGS':
        return `HDFCN${datePrefix}${rand6}`;
      case 'NET_BANKING':
      case 'IMPS':
        return `IMPS-${rand12}`;
      case 'CHEQUE':
        return `CHQ-${rand6}`;
      case 'CARD':
      case 'POS':
        return `POS-TXN-${rand6}`;
      case 'ADVANCE':
        return `ADV-${now.getTime().toString().slice(-4)}`;
      case 'CASH':
        return '';
      default:
        return `TXN-${rand6}`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. AUTH & CONTEXT
  // ═══════════════════════════════════════════════════════════════════════════

  function getToken() {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('auth_token') || localStorage.getItem('token') || null;
  }

  function getCurrentUser() {
    if (typeof localStorage === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem('auth_user') || '{}');
    } catch {
      return {};
    }
  }

  function getCurrentTenantId() {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem('selected_tenant_id') || localStorage.getItem('activeCompanyId') || '';
  }

  function authGuard() {
    const token = getToken();
    if (!token) {
      if (typeof window !== 'undefined' && !window.location.pathname.includes('index.html')) {
        window.location.href = 'index.html';
      }
      return false;
    }
    return true;
  }

  function signOut(promptConfirm = true) {
    if (promptConfirm && typeof confirm === 'function') {
      if (!confirm('Are you sure you want to sign out of WorkSpace?')) return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('token');
      localStorage.removeItem('selected_tenant_id');
    }
    if (typeof window !== 'undefined') {
      window.location.href = 'index.html';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. DROPDOWN & SEARCHABLE COMBOBOX ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  function populateDropdown(selectElOrId, items = [], options = {}) {
    const el = typeof selectElOrId === 'string' ? document.getElementById(selectElOrId) : selectElOrId;
    if (!el) return null;

    const placeholder = options.placeholder !== undefined ? options.placeholder : '— Select —';
    const placeholderVal = options.placeholderValue !== undefined ? options.placeholderValue : '';
    const valKey = options.valueKey || '_id';
    const labelKey = options.labelKey || 'name';
    const selVal = options.selectedValue !== undefined ? String(options.selectedValue) : null;

    let html = '';
    if (placeholder !== false && placeholder !== null) {
      html += `<option value="${escapeHtml(placeholderVal)}">${escapeHtml(placeholder)}</option>`;
    }

    if (Array.isArray(items)) {
      items.forEach(item => {
        if (options.formatOption) {
          const itemVal = typeof item === 'object' && item !== null ? String(item[valKey] ?? '') : String(item);
          const isSelected = selVal !== null && itemVal === selVal;
          html += options.formatOption(item, isSelected);
        } else {
          const isObj = typeof item === 'object' && item !== null;
          const val = isObj ? (item[valKey] ?? '') : item;
          const label = options.formatLabel ? options.formatLabel(item) : (isObj ? (item[labelKey] ?? val) : item);
          const isSelected = selVal !== null && String(val) === selVal;
          html += `<option value="${escapeHtml(val)}" ${isSelected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        }
      });
    }

    el.innerHTML = html;

    // Synchronize SearchableSelect wrapper if present
    if (el._searchableSelect) {
      el._searchableSelect.refresh();
    } else if (options.makeSearchable) {
      const ph = typeof options.makeSearchable === 'string' ? options.makeSearchable : '🔍 Type to search…';
      makeSearchable(el, { placeholder: ph });
    }

    return el;
  }

  function populateProductDropdown(selectElOrId, products = [], options = {}) {
    const mode = options.mode || 'SALES';
    return populateDropdown(selectElOrId, products, {
      placeholder: options.placeholder !== undefined ? options.placeholder : '— Select Product —',
      selectedValue: options.selectedValue,
      makeSearchable: options.makeSearchable !== false ? (options.searchPlaceholder || '🔍 Type product name or SKU…') : false,
      formatOption: (p, isSel) => {
        const price = mode === 'SALES' ? (p.sellingPrice || p.mrp || 0) : (p.purchasePrice || 0);
        const skuStr = p.sku ? ` (${p.sku})` : '';
        const priceStr = price ? ` · ₹${Number(price).toLocaleString('en-IN')}` : '';
        const tracking = p.trackingType || 'NONE';
        const cost = p.purchasePrice || 0;
        const sell = p.sellingPrice || p.mrp || 0;
        return `<option value="${p._id}" data-sku="${escapeHtml(p.sku || '')}" data-price="${price}" data-cost="${cost}" data-sell="${sell}" data-tracking="${tracking}" data-unit="${escapeHtml(p.unit || 'PCS')}" data-hsn="${escapeHtml(p.hsnCode || '')}" data-gst="${p.gstRate ?? 18}" ${isSel ? 'selected' : ''}>${escapeHtml(p.name)}${escapeHtml(skuStr)}${escapeHtml(priceStr)}</option>`;
      },
    });
  }

  function populatePartyDropdown(selectElOrId, parties = [], options = {}) {
    const type = options.type || 'CUSTOMER';
    const defaultPlaceholder = type === 'CUSTOMER' ? '— Select Customer —' : '— Select Supplier —';
    const defaultSearchPh = type === 'CUSTOMER' ? '🔍 Type customer name, phone…' : '🔍 Type supplier name, phone…';

    return populateDropdown(selectElOrId, parties, {
      placeholder: options.placeholder !== undefined ? options.placeholder : defaultPlaceholder,
      selectedValue: options.selectedValue,
      makeSearchable: options.makeSearchable !== false ? (options.searchPlaceholder || defaultSearchPh) : false,
      formatOption: (p, isSel) => {
        const phoneStr = p.phone ? ` (${p.phone})` : '';
        const gstinStr = p.gstin ? ` · GSTIN: ${p.gstin}` : '';
        const bal = p.outstanding || p.currentBalance || 0;
        return `<option value="${p._id}" data-phone="${escapeHtml(p.phone || '')}" data-gstin="${escapeHtml(p.gstin || '')}" data-state="${escapeHtml(p.state || 'Local')}" data-bal="${bal}" ${isSel ? 'selected' : ''}>${escapeHtml(p.name)}${escapeHtml(phoneStr)}${escapeHtml(gstinStr)}</option>`;
      },
    });
  }

  function populateWarehouseDropdown(selectElOrId, warehouses = [], options = {}) {
    return populateDropdown(selectElOrId, warehouses, {
      placeholder: options.placeholder !== undefined ? options.placeholder : '— Select Warehouse —',
      selectedValue: options.selectedValue,
      makeSearchable: options.makeSearchable !== false ? (options.searchPlaceholder || '🔍 Search warehouse…') : false,
      formatOption: (w, isSel) => {
        const codeStr = w.code ? ` (${w.code})` : '';
        return `<option value="${w._id}" data-code="${escapeHtml(w.code || '')}" ${isSel ? 'selected' : ''}>${escapeHtml(w.name)}${escapeHtml(codeStr)}</option>`;
      },
    });
  }

  function populateCategoryDropdown(selectElOrId, categories = [], options = {}) {
    const el = typeof selectElOrId === 'string' ? document.getElementById(selectElOrId) : selectElOrId;
    if (!el) return null;

    const placeholder = options.placeholder !== undefined ? options.placeholder : '— Select Category —';
    const selVal = options.selectedValue !== undefined ? String(options.selectedValue) : null;
    const allowCreateNew = options.allowCreateNew === true;

    let html = '';
    if (placeholder !== false && placeholder !== null) {
      html += `<option value="">${escapeHtml(placeholder)}</option>`;
    }
    if (allowCreateNew) {
      html += '<option value="__NEW__" style="color:#6366f1;font-weight:700;">➕ + Create Custom Category...</option>';
    }

    const rootCats = categories.filter(c => !c.parentId);
    const subCats = categories.filter(c => c.parentId);

    if (rootCats.length > 0) {
      rootCats.forEach(root => {
        const children = subCats.filter(s => String(s.parentId?._id || s.parentId) === String(root._id));
        const icon = root.icon || '🏷️';
        if (children.length > 0) {
          html += `<optgroup label="${icon} ${escapeHtml(root.name)}">`;
          html += `<option value="${root._id}" data-hsn="${escapeHtml(root.defaultHsn || '')}" data-gst="${root.defaultGstRate ?? 18}" ${selVal === String(root._id) ? 'selected' : ''}>${icon} All ${escapeHtml(root.name)}</option>`;
          children.forEach(sub => {
            html += `<option value="${sub._id}" data-hsn="${escapeHtml(sub.defaultHsn || root.defaultHsn || '')}" data-gst="${sub.defaultGstRate ?? root.defaultGstRate ?? 18}" ${selVal === String(sub._id) ? 'selected' : ''}>  └ ${escapeHtml(sub.name)}</option>`;
          });
          html += `</optgroup>`;
        } else {
          html += `<option value="${root._id}" data-hsn="${escapeHtml(root.defaultHsn || '')}" data-gst="${root.defaultGstRate ?? 18}" ${selVal === String(root._id) ? 'selected' : ''}>${icon} ${escapeHtml(root.name)}</option>`;
        }
      });
    } else {
      categories.forEach(c => {
        html += `<option value="${c._id}" data-hsn="${escapeHtml(c.defaultHsn || '')}" data-gst="${c.defaultGstRate ?? 18}" ${selVal === String(c._id) ? 'selected' : ''}>${c.icon || '🏷️'} ${escapeHtml(c.name)}</option>`;
      });
    }

    el.innerHTML = html;

    if (el._searchableSelect) {
      el._searchableSelect.refresh();
    } else if (options.makeSearchable) {
      makeSearchable(el, { placeholder: typeof options.makeSearchable === 'string' ? options.makeSearchable : '🔍 Search category…' });
    }

    return el;
  }

  function populateBankDropdown(selectElOrId, banks = [], options = {}) {
    return populateDropdown(selectElOrId, banks, {
      placeholder: options.placeholder !== undefined ? options.placeholder : '— Primary Bank / Cash Register —',
      selectedValue: options.selectedValue,
      makeSearchable: options.makeSearchable !== false ? (options.searchPlaceholder || '🔍 Select bank…') : false,
      formatOption: (b, isSel) => {
        const mask = b.accountNumberMasked || (b.accountNumber ? `•••• ${b.accountNumber.slice(-4)}` : '');
        const star = b.isDefault ? ' ⭐' : '';
        const name = b.bankName || b.accountName || 'Bank Account';
        return `<option value="${b._id}" data-acc="${escapeHtml(b.accountNumber || '')}" data-ifsc="${escapeHtml(b.ifscCode || '')}" data-upi="${escapeHtml(b.upiId || '')}" ${isSel || (b.isDefault && !options.selectedValue) ? 'selected' : ''}>🏦 ${escapeHtml(name)} (${escapeHtml(mask)})${star}</option>`;
      },
    });
  }

  function populateCompanyDropdown(selectElOrId, companies = [], options = {}) {
    return populateDropdown(selectElOrId, companies, {
      placeholder: options.placeholder !== undefined ? options.placeholder : '— All Companies / Consolidated —',
      selectedValue: options.selectedValue,
      makeSearchable: options.makeSearchable !== false ? (options.searchPlaceholder || '🔍 Switch company…') : false,
      formatOption: (c, isSel) => {
        const gstinStr = c.gstin ? ` (${c.gstin})` : '';
        return `<option value="${c._id}" ${isSel ? 'selected' : ''}>🏢 ${escapeHtml(c.name)}${escapeHtml(gstinStr)}</option>`;
      },
    });
  }

  class SearchableSelect {
    constructor(selectEl, options = {}) {
      if (!selectEl) return null;
      if (selectEl._searchableSelect) {
        if (options.placeholder) selectEl._searchableSelect.placeholder = options.placeholder;
        selectEl._searchableSelect.refresh();
        return selectEl._searchableSelect;
      }

      this.selectEl = selectEl;
      this.placeholder = options.placeholder || '🔍 Type to filter / select…';
      this.activeIdx = -1;
      this.isOpen = false;
      this.selectEl._searchableSelect = this;

      this.init();
    }

    init() {
      this.selectEl.style.display = 'none';

      this.wrap = document.createElement('div');
      this.wrap.className = 'ac-combobox-wrap';
      if (this.selectEl.className) {
        if (this.selectEl.classList.contains('form-select')) this.wrap.classList.add('form-select-wrap');
        if (this.selectEl.classList.contains('clean-input')) this.wrap.classList.add('clean-input-wrap');
      }

      this.input = document.createElement('input');
      this.input.type = 'text';
      this.input.className = 'ac-combobox-input';
      this.input.placeholder = this.placeholder;
      this.input.autocomplete = 'off';

      this.arrow = document.createElement('span');
      this.arrow.className = 'ac-combobox-arrow';
      this.arrow.textContent = '▾';

      this.dropdown = document.createElement('div');
      this.dropdown.className = 'ac-combobox-dropdown';

      this.wrap.appendChild(this.input);
      this.wrap.appendChild(this.arrow);
      this.wrap.appendChild(this.dropdown);

      if (this.selectEl.parentNode) {
        this.selectEl.parentNode.insertBefore(this.wrap, this.selectEl.nextSibling);
      }

      this.bindEvents();
      this.refresh();
      this.observeMutations();
    }

    observeMutations() {
      const observer = new MutationObserver(() => {
        this.refresh();
      });
      observer.observe(this.selectEl, { childList: true, subtree: true, attributes: true });
    }

    getSelectedOption() {
      const val = this.selectEl.value;
      const opts = Array.from(this.selectEl.options);
      return opts.find(o => o.value === val) || opts[0];
    }

    refresh() {
      const selected = this.getSelectedOption();
      if (selected && document.activeElement !== this.input) {
        this.input.value = (selected.value ? selected.text : '') || '';
      }
    }

    render(query = '') {
      const q = (query || '').toLowerCase().trim();
      const rawOptions = Array.from(this.selectEl.options);
      const selectedVal = this.selectEl.value;

      const filtered = q
        ? rawOptions.filter(o => smartSearchMatch(o.text, q) || smartSearchMatch(o.value, q))
        : rawOptions;

      this.activeIdx = -1;

      if (filtered.length === 0) {
        this.dropdown.innerHTML = `<div class="ac-combobox-no-results">No options matching "<strong>${escapeHtml(query)}</strong>"</div>`;
        this.open();
        return;
      }

      this.dropdown.innerHTML = filtered.map((opt, i) => `
        <div class="ac-combobox-opt ${opt.value === selectedVal ? 'selected' : ''}" data-val="${escapeHtml(opt.value)}" data-text="${escapeHtml(opt.text)}" data-idx="${i}">
          <span>${escapeHtml(opt.text)}</span>
          ${opt.value === selectedVal ? '<span style="color:#4ade80;font-size:0.8rem;margin-left:auto;">✓</span>' : ''}
        </div>
      `).join('');

      this.dropdown.querySelectorAll('.ac-combobox-opt').forEach(item => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.selectOption(item.getAttribute('data-val'), item.getAttribute('data-text'));
        });
      });

      this.open();
    }

    selectOption(val, text) {
      this.selectEl.value = val;
      this.input.value = val ? text : '';
      this.close();
      this.selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      this.selectEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    open() {
      document.querySelectorAll('.ac-combobox-dropdown.show').forEach(d => {
        if (d !== this.dropdown) d.classList.remove('show');
      });
      document.querySelectorAll('.ac-combobox-wrap.open').forEach(w => {
        if (w !== this.wrap) w.classList.remove('open');
      });

      this.dropdown.classList.add('show');
      this.wrap.classList.add('open');
      this.isOpen = true;
    }

    close() {
      this.dropdown.classList.remove('show');
      this.wrap.classList.remove('open');
      this.isOpen = false;
      this.activeIdx = -1;
    }

    bindEvents() {
      this.input.addEventListener('focus', () => {
        this.input.select();
        this.render('');
      });

      this.input.addEventListener('input', () => {
        this.render(this.input.value);
      });

      this.arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.isOpen) {
          this.close();
        } else {
          this.input.focus();
          this.render('');
        }
      });

      this.input.addEventListener('keydown', (e) => {
        const items = Array.from(this.dropdown.querySelectorAll('.ac-combobox-opt'));
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (!this.isOpen) { this.render(''); return; }
          this.activeIdx = Math.min(this.activeIdx + 1, items.length - 1);
          this.highlight(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (!this.isOpen) return;
          this.activeIdx = Math.max(this.activeIdx - 1, 0);
          this.highlight(items);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (this.activeIdx >= 0 && items[this.activeIdx]) {
            items[this.activeIdx].dispatchEvent(new MouseEvent('mousedown'));
          } else if (items.length > 0) {
            items[0].dispatchEvent(new MouseEvent('mousedown'));
          }
        } else if (e.key === 'Escape') {
          this.close();
        }
      });

      document.addEventListener('click', (e) => {
        if (!this.wrap.contains(e.target)) {
          this.close();
          const selected = this.getSelectedOption();
          if (selected) {
            this.input.value = (selected.value ? selected.text : '') || '';
          }
        }
      });
    }

    highlight(items) {
      items.forEach(el => el.classList.remove('ac-active'));
      if (items[this.activeIdx]) {
        items[this.activeIdx].classList.add('ac-active');
        items[this.activeIdx].scrollIntoView({ block: 'nearest' });
      }
    }
  }

  function makeSearchable(selectIdOrEl, placeholderOrOpts = '🔍 Type to filter / select…') {
    const el = typeof selectIdOrEl === 'string' ? document.getElementById(selectIdOrEl) : selectIdOrEl;
    if (!el) return null;
    const opts = typeof placeholderOrOpts === 'string' ? { placeholder: placeholderOrOpts } : (placeholderOrOpts || {});
    return new SearchableSelect(el, opts);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT & GLOBAL SHORTCUTS
  // ═══════════════════════════════════════════════════════════════════════════

  const AppUtils = {
    // API
    getApiBase,
    getHeaders,
    H: getHeaders,
    apiFetch,
    fetchProducts,
    fetchCustomers,
    fetchSuppliers,
    fetchWarehouses,
    fetchCategories,
    fetchBankAccounts,
    fetchCompanies,

    // Formatters
    formatINR,
    inr,
    formatDate,
    fmtDate,
    formatNumber,
    formatMasked,

    // DOM & UI
    escapeHtml,
    escHtml,
    debounce,
    smartSearchMatch,
    showToast,
    downloadCSV,
    printContent,
    openModal,
    closeModal,

    // Reference
    generateSmartRef,

    // Auth
    authGuard,
    getCurrentUser,
    getCurrentTenantId,
    signOut,

    // Dropdown Engine
    populateDropdown,
    populateProductDropdown,
    populatePartyDropdown,
    populateWarehouseDropdown,
    populateCategoryDropdown,
    populateBankDropdown,
    populateCompanyDropdown,
    makeSearchable,
    SearchableSelect,
  };

  root.AppUtils = AppUtils;

  // Bind backward-compatible global aliases on window
  root.H = getHeaders;
  root.inr = inr;
  root.formatINR = formatINR;
  root.escHtml = escHtml;
  root.escapeHtml = escapeHtml;
  root.fmtDate = fmtDate;
  root.formatDate = formatDate;
  root.debounce = debounce;
  root.showToast = showToast;
  root.downloadCSV = downloadCSV;
  root.printContent = printContent;
  root.generateSmartRef = generateSmartRef;
  root.makeSearchable = makeSearchable;
  root.populateDropdown = populateDropdown;
  root.populateProductDropdown = populateProductDropdown;
  root.populatePartyDropdown = populatePartyDropdown;
  root.populateWarehouseDropdown = populateWarehouseDropdown;
  root.populateCategoryDropdown = populateCategoryDropdown;
  root.populateBankDropdown = populateBankDropdown;
  root.populateCompanyDropdown = populateCompanyDropdown;
  root.fetchProducts = fetchProducts;
  root.fetchCustomers = fetchCustomers;
  root.fetchSuppliers = fetchSuppliers;
  root.fetchWarehouses = fetchWarehouses;
  root.fetchCategories = fetchCategories;
  root.fetchBankAccounts = fetchBankAccounts;
  root.fetchCompanies = fetchCompanies;

})(typeof window !== 'undefined' ? window : globalThis);
