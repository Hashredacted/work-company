/**
 * Standard Formatting Utilities (Currency, Dates, Numbers)
 * Provides unified Indian accounting formatters across the application.
 */
(function(root) {
  'use strict';

  /**
   * Format Indian Rupee currency with proper sign and locale grouping.
   * Example: 123456 -> "₹1,23,456", -500.5 -> "-₹500.50"
   *
   * @param {number|string} val - Amount to format
   * @param {Object} [options]
   * @param {number} [options.decimals] - Maximum fraction digits (default: auto/0)
   * @param {boolean} [options.forceDecimals=false] - Force fixed 2 decimal places
   * @returns {string}
   */
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

  /**
   * Short alias for formatINR
   */
  function inr(val, decimals) {
    return formatINR(val, decimals !== undefined ? { decimals } : {});
  }

  /**
   * Format dates to standard Indian readable format.
   * Example: "2026-09-03" -> "03 Sep 2026"
   *
   * @param {Date|string|number} d - Date to format
   * @param {Object} [options]
   * @param {boolean} [options.withTime=false] - Include time
   * @returns {string}
   */
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

  /**
   * Short alias for formatDate
   */
  function fmtDate(d) {
    return formatDate(d);
  }

  /**
   * Format numbers with Indian locale commas.
   *
   * @param {number|string} val
   * @param {number} [decimals=0]
   * @returns {string}
   */
  function formatNumber(val, decimals = 0) {
    const num = Number(val || 0);
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  /**
   * Mask account or card numbers.
   * Example: "50200012345678" -> "•••• 5678"
   *
   * @param {string} str
   * @param {number} [visibleDigits=4]
   * @returns {string}
   */
  function formatMasked(str, visibleDigits = 4) {
    const s = String(str || '').trim();
    if (!s) return '—';
    if (s.length <= visibleDigits) return s;
    return `•••• ${s.slice(-visibleDigits)}`;
  }

  const Formatters = {
    formatINR,
    inr,
    formatDate,
    fmtDate,
    formatNumber,
    formatMasked,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Formatters;
  }
  root.AppFormatters = Formatters;
})(typeof window !== 'undefined' ? window : globalThis);
