'use strict';

const Sequence = require('../models/Sequence');

/**
 * Get the current Indian financial year code.
 * India FY: April 1 – March 31
 * If today is in April-March of 2025-26, returns "2526"
 */
function fyCode() {
  const now = new Date();
  const month = now.getMonth(); // 0 = Jan, 3 = Apr
  const year  = now.getFullYear();
  const fyStart = month >= 3 ? year : year - 1;
  const fyEnd   = fyStart + 1;
  return String(fyStart).slice(2) + String(fyEnd).slice(2); // "2526"
}

/**
 * Generate the next sequence number for a document type within a tenant.
 *
 * @param {ObjectId} tenantId - Tenant identifier
 * @param {string}   docType  - e.g. 'PO', 'GRN', 'SO', 'ADJ'
 * @param {number}   padLen   - Zero-padding length (default 4 → 0001)
 * @returns {Promise<string>}  e.g. "PO-2526-0001"
 */
async function nextSeq(tenantId, docType, padLen = 4) {
  const key = `${docType}-${fyCode()}`;
  const seq = await Sequence.findOneAndUpdate(
    { tenantId, key },
    { $inc: { value: 1 } },
    { upsert: true, new: true }
  );
  return `${key}-${String(seq.value).padStart(padLen, '0')}`;
}

module.exports = { nextSeq, fyCode };
