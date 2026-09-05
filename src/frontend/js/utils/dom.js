/**
 * DOM & UI Helpers (Escaping, Debounce, Toast, CSV, Printing, Modals, Smart Search)
 */
(function(root) {
  'use strict';

  /**
   * Escape HTML entities to prevent XSS in dynamic templates.
   *
   * @param {any} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function escHtml(str) {
    return escapeHtml(str);
  }

  /**
   * General purpose debounce helper
   *
   * @param {Function} fn
   * @param {number} delay
   * @returns {Function}
   */
  function debounce(fn, delay = 300) {
    let timer = null;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * Smart search match helper:
   * Matches both word prefixes (e.g. "Par" matches "Parle-G") AND substring matches anywhere.
   *
   * @param {string} text
   * @param {string} query
   * @returns {boolean}
   */
  function smartSearchMatch(text, query) {
    if (!query) return true;
    if (!text) return false;
    const t = String(text).toLowerCase();
    const q = String(query).toLowerCase().trim();
    if (!q) return true;

    // Substring match
    if (t.includes(q)) return true;

    // Word boundary starting letters (acronyms or multi-word prefix)
    const words = t.split(/[\s\-_\/,\.]+/);
    return words.some(w => w.startsWith(q));
  }

  /**
   * Toast notification display
   *
   * @param {string} msg
   * @param {string} [type='info'] - 'success' | 'error' | 'warning' | 'info'
   * @param {number} [duration=3500]
   */
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

  /**
   * Universal CSV download helper
   *
   * @param {string} filename
   * @param {Array<Array<any>>} rows
   * @param {Array<string>} [headers]
   */
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

  /**
   * Print content in a clean dedicated print window
   *
   * @param {string} title
   * @param {string} htmlContent
   */
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

  /**
   * Generic Modal Open/Close helpers
   */
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

  const DomUtils = {
    escapeHtml,
    escHtml,
    debounce,
    smartSearchMatch,
    showToast,
    downloadCSV,
    printContent,
    openModal,
    closeModal,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DomUtils;
  }
  root.AppDomUtils = DomUtils;
})(typeof window !== 'undefined' ? window : globalThis);
