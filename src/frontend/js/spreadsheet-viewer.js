/**
 * Universal In-Browser Spreadsheet Viewer for WorkSpace
 * Renders a full interactive spreadsheet / grid directly in the browser
 * without requiring any file download.
 */
(function () {
  'use strict';

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getExcelColName(n) {
    let ordA = 'A'.charCodeAt(0);
    let ordZ = 'Z'.charCodeAt(0);
    let len = ordZ - ordA + 1;
    let s = '';
    while (n >= 0) {
      s = String.fromCharCode((n % len) + ordA) + s;
      n = Math.floor(n / len) - 1;
    }
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

  function downloadAsXls(rows, filenamePrefix = 'WorkSpace_Export') {
    if (!rows || !rows.length) {
      rows = extractVisibleTableRows();
    }
    if (!rows || !rows.length) {
      alert('No data available to export.');
      return;
    }

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
    a.href = url;
    a.download = `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
            <button id="sv-xls-btn" class="sv-btn sv-btn-excel" title="Download as Microsoft Excel file (.xls)">
              <span>📥</span> Download Excel
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
          <div>Tip: Use the search box above to instantly filter records without downloading.</div>
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

    // Download XLS
    xlsBtn.addEventListener('click', () => {
      downloadAsXls(rows, filenamePrefix);
    });
  }

  // Export to window
  window.showSpreadsheetPreview = showSpreadsheetPreview;
  window.downloadAsXls = downloadAsXls;
})();
