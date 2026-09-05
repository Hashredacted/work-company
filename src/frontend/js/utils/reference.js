/**
 * Reference Number Generator Utility
 * Generates consistent, realistic Indian commercial/banking transaction references.
 */
(function(root) {
  'use strict';

  /**
   * Generate a smart reference number based on payment mode and category.
   *
   * @param {string} mode - 'UPI' | 'NEFT_RTGS' | 'NET_BANKING' | 'CHEQUE' | 'CARD' | 'CASH'
   * @param {string} [category=''] - Optional category for contra transfers or specific entries
   * @returns {string}
   */
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

  const ReferenceUtils = {
    generateSmartRef,
    generateSmartUTR: generateSmartRef,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReferenceUtils;
  }
  root.AppReferenceUtils = ReferenceUtils;
})(typeof window !== 'undefined' ? window : globalThis);
