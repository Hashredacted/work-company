'use strict';

/**
 * India GST Calculation Engine
 *
 * Rules:
 *  - Same state (intrastate): CGST = SGST = gstRate/2 each
 *  - Different state (interstate): IGST = full gstRate
 *  - isInterstate determined by comparing tenant stateCode vs supplier/customer stateCode
 */

function r2(n) { return Math.round(n * 100) / 100; }

/**
 * Calculate GST for a single line item.
 * @param {number} unitPrice   - Price per unit (INR, excl. GST)
 * @param {number} qty         - Quantity
 * @param {number} discountPct - Discount percentage (0-100)
 * @param {number} gstRate     - GST rate (0, 5, 12, 18, 28)
 * @param {number} cessRate    - Cess rate (default 0)
 * @param {boolean} isInterstate - true → IGST; false → CGST+SGST
 * @returns {object} line breakdown
 */
function calcLine(unitPrice, qty, discountPct = 0, gstRate = 0, cessRate = 0, isInterstate = false) {
  const gross = r2(unitPrice * qty);
  const discount = r2(gross * (discountPct / 100));
  const taxable = r2(gross - discount);
  const gstAmount = r2(taxable * (gstRate / 100));
  const cessAmount = r2(taxable * (cessRate / 100));

  let cgst = 0, sgst = 0, igst = 0;
  if (isInterstate) {
    igst = gstAmount;
  } else {
    cgst = r2(gstAmount / 2);
    sgst = r2(gstAmount / 2);
    // Handle floating-point rounding: ensure cgst+sgst === gstAmount
    if (r2(cgst + sgst) !== gstAmount) sgst = r2(gstAmount - cgst);
  }

  return {
    gross,
    discount,
    taxableAmount: taxable,
    gstRate,
    cessRate,
    cgst,
    sgst,
    igst,
    cess: cessAmount,
    lineTotal: r2(taxable + gstAmount + cessAmount),
  };
}

/**
 * Sum up line totals into order-level totals.
 * @param {Array} lines - Array of calcLine() results
 * @returns {object} order totals
 */
function sumOrder(lines) {
  return lines.reduce((acc, l) => ({
    subtotal:      r2(acc.subtotal      + l.gross),
    totalDiscount: r2(acc.totalDiscount + l.discount),
    totalTaxable:  r2(acc.totalTaxable  + l.taxableAmount),
    totalCgst:     r2(acc.totalCgst     + l.cgst),
    totalSgst:     r2(acc.totalSgst     + l.sgst),
    totalIgst:     r2(acc.totalIgst     + l.igst),
    totalCess:     r2(acc.totalCess     + l.cess),
    grandTotal:    r2(acc.grandTotal    + l.lineTotal),
  }), { subtotal: 0, totalDiscount: 0, totalTaxable: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0, totalCess: 0, grandTotal: 0 });
}

/**
 * Determine if a transaction is interstate.
 * @param {string} tenantStateCode   - 2-digit code of tenant's state (from Tenant / Warehouse)
 * @param {string} partyStateCode    - 2-digit code of supplier/customer state
 */
function isInterstate(tenantStateCode, partyStateCode) {
  if (!tenantStateCode || !partyStateCode) return false;
  return tenantStateCode.trim() !== partyStateCode.trim();
}

module.exports = { calcLine, sumOrder, isInterstate };
