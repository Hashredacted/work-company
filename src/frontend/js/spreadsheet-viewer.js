/**
 * Universal In-Browser Spreadsheet Viewer for WorkSpace
 * Powered by SheetJS (xlsx) — real .xlsx exports + interactive browser preview.
 * Public API (window globals):
 *   showSpreadsheetPreview(rows, title?, filenamePrefix?)
 *   downloadAsXls(rows, filenamePrefix?)
 */
(function () {
  'use strict';

  // ─── SheetJS CDN loader ──────────────────────────────────────────────────────
  const SHEETJS_CDN = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  let _xlsxReady = null;

  function loadXLSX() {
    if (_xlsxReady) return _xlsxReady;
    if (window.XLSX) { _xlsxReady = Promise.resolve(window.XLSX); return _xlsxReady; }
    _xlsxReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SHEETJS_CDN;
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => reject(new Error('SheetJS CDN failed to load. Check internet.'));
      document.head.appendChild(s);
    });
    return _xlsxReady;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getExcelColName(n) {
    const ordA = 'A'.charCodeAt(0), len = 26;
    let s = '';
    while (n >= 0) { s = String.fromCharCode((n % len) + ordA) + s; n = Math.floor(n / len) - 1; }
    return s || 'A';
  }

  function extractVisibleTableRows() {
    try {
      const activeContainer = document.querySelector('.content-section.active, .report-panel.active, .fin-panel.active, .tab-pane.active') || document.body;
      const table = (activeContainer ? activeContainer.querySelector('table') : null) || document.querySelector('table');
      if (!table) return null;

      const rows = [];
      const ths = Array.from(table.querySelectorAll('thead th'));
      const headerNames = ths.map(th => th.textContent.trim()).filter(h => h && h.toLowerCase() !== 'actions');

      if (headerNames.length > 0) {
        rows.push(headerNames);
      }

      const trs = Array.from(table.querySelectorAll('tbody tr'));
      trs.forEach(tr => {
        const tds = Array.from(tr.querySelectorAll('td'));
        if (!tds.length || (tds.length === 1 && tds[0].hasAttribute('colspan'))) return;
        const cellValues = tds.map(td => td.textContent.trim());
        if (cellValues.length > 0) {
          // Exclude actions column if header was excluded
          const cleanRow = ths.length ? cellValues.filter((_, idx) => ths[idx] && ths[idx].textContent.trim().toLowerCase() !== 'actions') : cellValues;
          rows.push(cleanRow);
        }
      });

      return rows.length >= 2 ? rows : null;
    } catch (e) {
      console.warn('DOM table fallback extraction error:', e);
      return null;
    }
  }

  // ─── SheetJS .xlsx Download ───────────────────────────────────────────────────
  async function downloadAsXls(rows, filenamePrefix = 'WorkSpace_Export') {
    if (!rows || !rows.length) rows = extractVisibleTableRows();
    if (!rows || !rows.length) { alert('No data available to export.'); return; }

    try {
      const XLSX = await loadXLSX();

      const ws = XLSX.utils.aoa_to_sheet(rows);

      // Auto-column widths
      ws['!cols'] = (rows[0] || []).map((_, ci) => ({
        wch: Math.min(40, Math.max(12, ...rows.map(r => String(r[ci] ?? '').length)))
      }));

      // Freeze header row
      ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      XLSX.writeFile(wb, `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('SheetJS export error:', err);
      alert('Excel export failed: ' + err.message);
    }
  }

  function showSpreadsheetPreview(rows, title = 'Spreadsheet Data', filenamePrefix = 'WorkSpace_Export') {
    // If rows is null/empty, attempt DOM extraction fallback
    if (!rows || !rows.length) {
      rows = extractVisibleTableRows();
    }

    // If still empty, display clean placeholder
    if (!rows || !rows.length) {
      rows = [
        ['#', 'Status / Notice'],
        ['1', 'No records are currently loaded in this table. Please refresh or select a filter.']
      ];
    }

    const headers = rows[0] || ['#', 'Column 1'];
    const dataRows = rows.slice(1);

    // Remove existing modal if any
    const existing = document.getElementById('spreadsheet-viewer-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'spreadsheet-viewer-modal';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: rgba(10, 15, 29, 0.85);
      backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      animation: svFadeIn 0.18s ease-out;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    `;

    const totalRows = dataRows.length;
    const totalCols = headers.length;

    modal.innerHTML = `
      <style>
        @keyframes svFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        .sv-btn {
          padding: 7px 14px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid transparent;
          transition: all 0.15s ease;
          font-family: inherit;
        }
        .sv-btn-primary { background: #38bdf8; color: #000; border-color: #38bdf8; }
        .sv-btn-primary:hover { background: #7dd3fc; }
        .sv-btn-excel { background: rgba(34, 197, 94, 0.18); color: #4ade80; border-color: rgba(34, 197, 94, 0.35); }
        .sv-btn-excel:hover { background: rgba(34, 197, 94, 0.28); }
        .sv-btn-secondary { background: rgba(255,255,255,0.06); color: #e2e8f0; border-color: rgba(255,255,255,0.12); }
        .sv-btn-secondary:hover { background: rgba(255,255,255,0.12); }
        .sv-grid-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8rem;
          color: #f1f5f9;
        }
        .sv-grid-table th, .sv-grid-table td {
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 7px 14px;
          white-space: nowrap;
        }
        .sv-grid-table thead th {
          background: #1e293b;
          color: #94a3b8;
          font-weight: 700;
          position: sticky;
          top: 0;
          z-index: 2;
          text-align: left;
        }
        .sv-grid-table thead tr.sv-col-letters th {
          background: #0f172a;
          color: #64748b;
          font-size: 0.7rem;
          text-align: center;
          padding: 3px 8px;
          font-family: monospace;
        }
        .sv-grid-table tbody tr:nth-child(even) {
          background: rgba(255, 255, 255, 0.02);
        }
        .sv-grid-table tbody tr:hover {
          background: rgba(56, 189, 248, 0.08);
        }
        .sv-row-num {
          background: #0f172a !important;
          color: #64748b !important;
          font-size: 0.72rem;
          font-family: monospace;
          text-align: center;
          user-select: none;
          width: 42px;
          position: sticky;
          left: 0;
          z-index: 1;
        }
      </style>
      <div style="background:#0b1329;border:1px solid rgba(255,255,255,0.14);border-radius:14px;box-shadow:0 25px 60px -15px rgba(0,0,0,0.8);width:96vw;max-width:1300px;height:90vh;display:flex;flex-direction:column;overflow:hidden;">
        
        <!-- Header Bar -->
        <div style="padding:14px 20px;background:#0f172a;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:38px;height:38px;border-radius:8px;background:linear-gradient(135deg, #10b981, #059669);display:flex;align-items:center;justify-content:center;font-size:1.25rem;box-shadow:0 4px 12px rgba(16,185,129,0.3);">
              📊
            </div>
            <div>
              <div style="font-size:1.1rem;font-weight:800;color:#f8fafc;display:flex;align-items:center;gap:8px;">
                <span>${esc(title)}</span>
                <span style="font-size:0.7rem;padding:2px 8px;border-radius:10px;background:rgba(56,189,248,0.12);color:#38bdf8;font-weight:700;">Live Browser View</span>
              </div>
              <div style="font-size:0.75rem;color:#94a3b8;margin-top:2px;">
                Interactive Grid · <strong style="color:#e2e8f0;">${totalRows}</strong> records × <strong style="color:#e2e8f0;">${totalCols}</strong> columns
              </div>
            </div>
          </div>

          <!-- Quick Actions -->
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <input id="sv-search" type="text" placeholder="🔍 Filter rows..." style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#f8fafc;padding:7px 12px;border-radius:6px;font-size:0.8rem;width:190px;outline:none;" />
            <button id="sv-copy-btn" class="sv-btn sv-btn-secondary" title="Copy formatted table to clipboard to paste directly in Excel / Google Sheets">
              <span>📋</span> Copy Table
            </button>
            <button id="sv-tab-btn" class="sv-btn sv-btn-secondary" title="Open sheet in dedicated full browser tab">
              <span>🌐</span> Open in Tab
            </button>
            <button id="sv-print-btn" class="sv-btn sv-btn-secondary" title="Print this spreadsheet view">
              <span>🖨️</span> Print
            </button>
            <button id="sv-xls-btn" class="sv-btn sv-btn-excel" title="Download as real .xlsx (powered by SheetJS)">
              <span>&#128229;</span> Download .xlsx
            </button>
            <button id="sv-close-btn" class="sv-btn" style="background:rgba(239,68,68,0.15);color:#f87171;border-color:rgba(239,68,68,0.3);padding:7px 12px;font-weight:bold;" title="Close viewer (Esc)">
              ✕ Close
            </button>
          </div>
        </div>

        <!-- Excel Formula / Status Bar -->
        <div style="padding:6px 20px;background:#090d1a;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:space-between;font-size:0.72rem;color:#64748b;">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-family:monospace;background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:4px;color:#94a3b8;">fx A1:${getExcelColName(totalCols - 1)}${totalRows + 1}</span>
            <span id="sv-match-count" style="color:#38bdf8;">Showing all ${totalRows} records</span>
          </div>
          <div>Powered by <strong style="color:#4ade80;">SheetJS</strong> &middot; Tip: use search above to filter without downloading</div>
        </div>

        <!-- Spreadsheet Table Body -->
        <div style="flex:1;overflow:auto;position:relative;" id="sv-scroll-container">
          <table class="sv-grid-table" id="sv-table">
            <thead>
              <tr class="sv-col-letters">
                <th class="sv-row-num">#</th>
                ${headers.map((_, i) => `<th>${getExcelColName(i)}</th>`).join('')}
              </tr>
              <tr>
                <th class="sv-row-num">1</th>
                ${headers.map(h => `<th>${esc(h)}</th>`).join('')}
              </tr>
            </thead>
            <tbody id="sv-tbody">
              ${dataRows.map((row, rIdx) => `
                <tr data-row-text="${esc(row.join(' ').toLowerCase())}">
                  <td class="sv-row-num">${rIdx + 2}</td>
                  ${row.map(cell => `<td>${esc(cell)}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

      </div>
    `;

    document.body.appendChild(modal);

    // Event Bindings
    const searchInput = modal.querySelector('#sv-search');
    const tbody = modal.querySelector('#sv-tbody');
    const matchCount = modal.querySelector('#sv-match-count');
    const closeBtn = modal.querySelector('#sv-close-btn');
    const copyBtn = modal.querySelector('#sv-copy-btn');
    const printBtn = modal.querySelector('#sv-print-btn');
    const xlsBtn = modal.querySelector('#sv-xls-btn');
    const tabBtn = modal.querySelector('#sv-tab-btn');

    searchInput.focus();

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      const trs = tbody.querySelectorAll('tr');
      let visible = 0;
      trs.forEach(tr => {
        const txt = tr.getAttribute('data-row-text') || '';
        const match = !q || txt.includes(q);
        tr.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      matchCount.textContent = q ? `Showing ${visible} of ${totalRows} matching records` : `Showing all ${totalRows} records`;
    });

    closeBtn.addEventListener('click', () => modal.remove());

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);

    // Copy to clipboard
    copyBtn.addEventListener('click', () => {
      const tsv = rows.map(r => r.map(c => String(c ?? '').replace(/\t/g, ' ')).join('\t')).join('\n');
      navigator.clipboard.writeText(tsv).then(() => {
        const orig = copyBtn.innerHTML;
        copyBtn.innerHTML = '<span>✓</span> Copied!';
        copyBtn.style.color = '#4ade80';
        setTimeout(() => {
          copyBtn.innerHTML = orig;
          copyBtn.style.color = '';
        }, 1800);
      }).catch(() => {
        alert('Could not copy to clipboard.');
      });
    });

    // Print
    printBtn.addEventListener('click', () => {
      const printWin = window.open('', '_blank');
      if (!printWin) {
        alert('Please allow popups to print.');
        return;
      }
      printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${esc(title)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
            h2 { margin-bottom: 4px; }
            .meta { font-size: 12px; color: #666; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
            th { background: #f0f4f8; font-weight: bold; }
            tr:nth-child(even) td { background: #fafafa; }
          </style>
        </head>
        <body>
          <h2>${esc(title)}</h2>
          <div class="meta">Generated by WorkSpace · Date: ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN')} · Total Records: ${totalRows}</div>
          <table>
            <thead>
              <tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${dataRows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
          <script>window.onload = function() { window.print(); window.close(); }<\/script>
        </body>
        </html>
      `);
      printWin.document.close();
    });

    // Open in dedicated Tab
    tabBtn.addEventListener('click', () => {
      const tabWin = window.open('', '_blank');
      if (!tabWin) {
        alert('Please allow popups to open in a new tab.');
        return;
      }
      tabWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${esc(title)} - WorkSpace Grid</title>
          <style>
            body { margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: #0f172a; color: #f8fafc; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #334155; }
            h1 { margin: 0; font-size: 1.25rem; }
            .badge { background: rgba(56,189,248,0.15); color: #38bdf8; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; font-size: 0.8rem; background: #1e293b; border-radius: 8px; overflow: hidden; }
            th, td { border: 1px solid #334155; padding: 8px 12px; white-space: nowrap; text-align: left; }
            th { background: #0f172a; color: #94a3b8; font-weight: bold; position: sticky; top: 0; }
            tr:nth-child(even) td { background: rgba(255,255,255,0.02); }
            tr:hover td { background: rgba(56,189,248,0.1); }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>📊 ${esc(title)}</h1>
              <div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">${totalRows} rows × ${totalCols} columns · Generated by WorkSpace</div>
            </div>
            <span class="badge">Live Browser View</span>
          </div>
          <table>
            <thead>
              <tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${dataRows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </body>
        </html>
      `);
      tabWin.document.close();
    });

    // Download .xlsx via SheetJS
    xlsBtn.addEventListener('click', async () => {
      const origHtml = xlsBtn.innerHTML;
      xlsBtn.disabled = true;
      xlsBtn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#4ade80;border-radius:50%;animation:sv-spin 0.6s linear infinite;"></span> Generating&hellip;';
      if (!document.querySelector('#sv-spin-kf')) {
        const kf = document.createElement('style');
        kf.id = 'sv-spin-kf';
        kf.textContent = '@keyframes sv-spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(kf);
      }
      try {
        await downloadAsXls(rows, filenamePrefix);
      } finally {
        xlsBtn.disabled = false;
        xlsBtn.innerHTML = origHtml;
      }
    });

    // Pre-load SheetJS in background so download feels instant
    loadXLSX().catch(() => { });
  }

  // ─── Custom Autocomplete (replaces native <datalist> filtering) ──────────────
  /**
   * initAutocomplete(inputEl, getOptions)
   *
   * Converts a plain <input> into a fully filtered custom autocomplete.
   *
   * @param {HTMLInputElement} inputEl   - The text input element
   * @param {Function}         getOptions - Returns [{value, label?}] or string[]
   *
   * Usage:
   *   initAutocomplete(document.getElementById('qe-party-name'), () => teamNames);
   */
  function initAutocomplete(inputEl, getOptions) {
    if (!inputEl) return;

    // Wrap input in a relative container if not already
    const parent = inputEl.parentElement;
    if (!parent.classList.contains('ac-wrap')) {
      parent.classList.add('ac-wrap');
    }

    // Remove native datalist linkage
    inputEl.removeAttribute('list');

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'ac-dropdown';
    parent.appendChild(dropdown);

    let activeIdx = -1;

    function normalise(opts) {
      return opts.map(o => typeof o === 'string' ? { value: o, label: '' } : o);
    }

    function render(query) {
      const opts = normalise(getOptions());
      const q = (query || '').toLowerCase().trim();
      const filtered = q
        ? opts.filter(o => matchWordStartingLetters(o.value, q) || matchWordStartingLetters(o.label, q))
        : opts;

      activeIdx = -1;

      if (filtered.length === 0) {
        dropdown.innerHTML = q
          ? `<div class="ac-no-results">No team member starting with "<strong>${escHtml(query)}</strong>" — your custom entry will be saved</div>`
          : '';
        return;
      }

      dropdown.innerHTML = filtered.map((o, i) => `
        <div class="ac-item" data-value="${escHtml(o.value)}" data-idx="${i}">
          <span class="ac-item-badge">👤 Team</span>
          <span>${escHtml(o.value)}</span>
          ${o.label ? `<span style="font-size:0.72rem;color:var(--text-muted);margin-left:auto;">${escHtml(o.label)}</span>` : ''}
        </div>
      `).join('');

      // Click to select
      dropdown.querySelectorAll('.ac-item').forEach(item => {
        item.addEventListener('mousedown', e => {
          e.preventDefault(); // prevent input blur
          inputEl.value = item.getAttribute('data-value');
          dropdown.innerHTML = '';
          inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    }

    function setActive(newIdx, items) {
      items.forEach(el => el.classList.remove('ac-active'));
      activeIdx = Math.max(0, Math.min(newIdx, items.length - 1));
      if (items[activeIdx]) {
        items[activeIdx].classList.add('ac-active');
        items[activeIdx].scrollIntoView({ block: 'nearest' });
      }
    }

    inputEl.addEventListener('input', () => render(inputEl.value));
    inputEl.addEventListener('focus', () => render(inputEl.value));

    inputEl.addEventListener('keydown', e => {
      const items = [...dropdown.querySelectorAll('.ac-item')];
      if (!items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIdx + 1, items); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIdx - 1, items); }
      else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        inputEl.value = items[activeIdx].getAttribute('data-value');
        dropdown.innerHTML = '';
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (e.key === 'Escape') {
        dropdown.innerHTML = '';
      }
    });

    // Close on outside click
    document.addEventListener('click', e => {
      if (!parent.contains(e.target)) dropdown.innerHTML = '';
    });

    // Helper to programmatically update suggestions (called after async data load)
    inputEl._acRefresh = () => {
      if (document.activeElement === inputEl) render(inputEl.value);
    };
  }

  // Helper: Matches if target or any word in target starts with query
  function matchWordStartingLetters(targetText, query) {
    if (!query) return true;
    const q = String(query).toLowerCase().trim();
    if (!q) return true;

    const text = String(targetText || '').toLowerCase().trim();
    if (!text) return false;

    // 1. Direct text prefix match (e.g. "sal" matches "Sales")
    if (text.startsWith(q)) return true;

    // 2. Word boundary prefix match: any word starts with query
    const words = text.split(/[\s\-_/()[\].,:+&|/\\]+/).filter(Boolean);
    if (words.some(w => w.startsWith(q))) return true;

    // 3. Acronym / First letters match (e.g. "sbi" matches "State Bank of India")
    const initials = words.map(w => w[0] || '').join('');
    if (initials.startsWith(q)) return true;

    return false;
  }

  // ─── Universal Combobox Searchable Select (Exactly like Name Dropdown Search) ───
  class SearchableSelect {
    constructor(selectEl, placeholder = '🔍 Type to filter / select…') {
      if (!selectEl) return null;
      if (selectEl._searchableSelect) {
        selectEl._searchableSelect.refresh();
        return selectEl._searchableSelect;
      }

      this.selectEl = selectEl;
      this.placeholder = placeholder;
      this.activeIdx = -1;
      this.isOpen = false;
      this.selectEl._searchableSelect = this;
      this.selectEl._searchable = this;

      this.init();
    }

    init() {
      // Hide original select
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
        this.input.value = selected.text || '';
      }
    }

    render(query = '') {
      const q = (query || '').toLowerCase().trim();
      const rawOptions = Array.from(this.selectEl.options);
      const selectedVal = this.selectEl.value;

      // Only match starting letters of each word
      const filtered = q
        ? rawOptions.filter(o => matchWordStartingLetters(o.text, q) || matchWordStartingLetters(o.value, q))
        : rawOptions;

      this.activeIdx = -1;

      if (filtered.length === 0) {
        this.dropdown.innerHTML = `<div class="ac-combobox-no-results">No options starting with "<strong>${escHtml(query)}</strong>"</div>`;
        this.open();
        return;
      }

      this.dropdown.innerHTML = filtered.map((opt, i) => `
        <div class="ac-combobox-opt ${opt.value === selectedVal ? 'selected' : ''}" data-val="${escHtml(opt.value)}" data-text="${escHtml(opt.text)}" data-idx="${i}">
          <span>${escHtml(opt.text)}</span>
          ${opt.value === selectedVal ? '<span style="color:#4ade80;font-size:0.8rem;">✓</span>' : ''}
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
      this.input.value = text;
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

    setActive(newIdx, items) {
      items.forEach(el => el.classList.remove('ac-active'));
      this.activeIdx = Math.max(0, Math.min(newIdx, items.length - 1));
      if (items[this.activeIdx]) {
        items[this.activeIdx].classList.add('ac-active');
        items[this.activeIdx].scrollIntoView({ block: 'nearest' });
      }
    }

    bindEvents() {
      // Focus / Click: open and show full or filtered options
      this.input.addEventListener('focus', () => {
        this.input.select();
        this.render('');
      });

      this.input.addEventListener('click', () => {
        if (!this.isOpen) {
          this.render('');
        }
      });

      // Typing letters directly in input: live filter & narrow down
      this.input.addEventListener('input', () => {
        this.render(this.input.value);
      });

      // Keyboard navigation
      this.input.addEventListener('keydown', (e) => {
        const items = [...this.dropdown.querySelectorAll('.ac-combobox-opt')];
        if (!items.length) {
          if (e.key === 'Escape') this.close();
          return;
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (!this.isOpen) this.render(this.input.value);
          else this.setActive(this.activeIdx + 1, items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (!this.isOpen) this.render(this.input.value);
          else this.setActive(this.activeIdx - 1, items);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (this.activeIdx >= 0 && items[this.activeIdx]) {
            const item = items[this.activeIdx];
            this.selectOption(item.getAttribute('data-val'), item.getAttribute('data-text'));
          } else if (items.length > 0) {
            const item = items[0];
            this.selectOption(item.getAttribute('data-val'), item.getAttribute('data-text'));
          }
        } else if (e.key === 'Escape') {
          this.close();
          this.refresh();
        }
      });

      // Click outside: close & restore text
      document.addEventListener('click', (e) => {
        if (!this.wrap.contains(e.target)) {
          this.close();
          this.refresh();
        }
      });
    }
  }

  function makeSearchable(selectIdOrEl, placeholder = '🔍 Type to filter / select…') {
    const el = typeof selectIdOrEl === 'string' ? document.getElementById(selectIdOrEl) : selectIdOrEl;
    if (!el) return null;
    return new SearchableSelect(el, placeholder);
  }

  function makeAllSelectsSearchable(root = document) {
    if (!root || !root.querySelectorAll) return;
    const selects = root.querySelectorAll('select:not([data-no-search]):not(.no-searchable)');
    selects.forEach(sel => {
      makeSearchable(sel);
    });
  }

  // Universal DOM Observer: Auto-converts any newly added <select> into a searchable combobox!
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      makeAllSelectsSearchable(document);

      // Observe dynamic insertions (modals, AJAX content, new rows)
      const domObserver = new MutationObserver((mutations) => {
        mutations.forEach(m => {
          m.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
              if (node.tagName === 'SELECT') {
                makeSearchable(node);
              } else if (node.querySelectorAll) {
                makeAllSelectsSearchable(node);
              }
            }
          });
        });
      });

      domObserver.observe(document.body, { childList: true, subtree: true });
    });
  }

  function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Universal Theme Manager (Dark / Light Mode) ───────────────────────────
  function initTheme() {
    if (typeof document === 'undefined' || !document || !document.documentElement) return;
    const savedTheme = (typeof localStorage !== 'undefined' && localStorage.getItem('app_theme')) || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeToggles(savedTheme);
  }

  function toggleTheme() {
    if (typeof document === 'undefined' || !document || !document.documentElement) return;
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('app_theme', next);
    }
    updateThemeToggles(next);
    return next;
  }

  function updateThemeToggles(theme) {
    if (typeof document === 'undefined' || !document) return;
    const isLight = theme === 'light';
    const btns = document.querySelectorAll ? document.querySelectorAll('.btn-theme-toggle') : [];
    btns.forEach(btn => {
      const icon = btn.querySelector('.theme-icon');
      const text = btn.querySelector('.theme-text');
      if (icon) icon.textContent = isLight ? '🌙' : '☀️';
      if (text) text.textContent = isLight ? 'Dark' : 'Light';
      btn.title = isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';
    });
  }

  if (typeof document !== 'undefined') {
    initTheme();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initTheme();
      });
    }
  }

  // ─── Expose globally ──────────────────────────────────────────────────────────
  window.showSpreadsheetPreview = showSpreadsheetPreview;
  window.downloadAsXls = downloadAsXls;
  window.initAutocomplete = initAutocomplete;
  window.matchWordStartingLetters = matchWordStartingLetters;
  window.SearchableSelect = SearchableSelect;
  window.makeSearchable = makeSearchable;
  window.makeAllSelectsSearchable = makeAllSelectsSearchable;
  window.initTheme = initTheme;
  window.toggleTheme = toggleTheme;
})();


