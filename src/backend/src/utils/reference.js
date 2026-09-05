'use strict';

/**
 * Generate standardized Indian commercial and banking auto-references.
 * Supports UPI, NEFT, IMPS, Cheques, Cash vouchers, POS card receipts, and contra transfers.
 * 
 * @param {string} mode - Payment mode ('UPI' | 'NEFT_RTGS' | 'NET_BANKING' | 'CHEQUE' | 'CARD' | 'CASH')
 * @param {string} [category] - Optional category ('CASH_DEPOSIT_BANK' | 'CASH_WITHDRAWAL_BANK' | 'INTER_BANK_TRANSFER')
 * @returns {string}
 */
function generateAutoReference(mode, category = '') {
  const rand6 = Math.floor(100000 + Math.random() * 900000);
  const rand12 = Math.floor(100000000000 + Math.random() * 900000000000);

  if (category === 'CASH_DEPOSIT_BANK') return `DEP-SLIP-${rand6}`;
  if (category === 'CASH_WITHDRAWAL_BANK') return `CHQ-${rand6}`;
  if (category === 'INTER_BANK_TRANSFER') return `IMPS-${rand12}`;

  const cleanMode = (mode || '').toUpperCase().trim();
  switch (cleanMode) {
    case 'UPI':
      return `UPI/${rand12}@okhdfc`;
    case 'NEFT_RTGS':
    case 'NEFT':
    case 'RTGS':
      return `HDFCN${rand6}`;
    case 'NET_BANKING':
    case 'IMPS':
      return `IMPS-${rand12}`;
    case 'CHEQUE':
      return `CHQ-${rand6}`;
    case 'CARD':
    case 'POS':
      return `POS-TXN-${rand6}`;
    case 'CASH':
      return `CASH-RCPT-${rand6}`;
    default:
      return `TXN-${rand6}`;
  }
}

module.exports = {
  generateAutoReference,
};
