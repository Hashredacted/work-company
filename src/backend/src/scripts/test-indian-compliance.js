'use strict';
/**
 * Verification test for Indian Logistics, Retail Billing & Statutory Compliance Suite
 */
const mongoose = require('mongoose');
const PaymentTransaction = require('../models/inv/PaymentTransaction');
const Supplier = require('../models/inv/Supplier');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ Passed: ${message}`);
  }
}

console.log('\n--- 1. Testing PaymentTransaction Schema Extensions ---');
const dummyTxn = new PaymentTransaction({
  tenantId: new mongoose.Types.ObjectId(),
  companyId: new mongoose.Types.ObjectId(),
  voucherNo: 'CRN-2526-0001',
  txnType: 'CREDIT_NOTE',
  partyType: 'CUSTOMER',
  partyId: new mongoose.Types.ObjectId(),
  partyName: 'Reliance Retail Pvt Ltd',
  items: [{
    productId: new mongoose.Types.ObjectId(),
    productName: 'Samsung 55 Inch Smart 4K TV',
    qty: 2,
    unitPrice: 45000,
    discountPct: 5,
    taxPct: 18,
    taxableAmount: 85500,
    cgstAmount: 7695,
    sgstAmount: 7695,
    totalAmount: 100890,
  }],
  subtotal: 85500,
  taxTotal: 15390,
  totalAmount: 100890,
  amount: 100890,
  roundOff: 0.10,
  isRcm: false,
  originalVoucherNo: 'INV-2526-0089',
  originalInvoiceDate: new Date('2026-02-15'),
  reasonForReturn: 'DEFICIENT_GOODS',
  eWayBillNo: '121234567890',
  eWayBillDate: new Date('2026-03-01'),
  transporterId: '27AABCT1234F1Z1',
  transporterName: 'VRL Logistics Ltd',
  transportMode: 'ROAD',
  vehicleNo: 'MH-12-AB-1234',
  vehicleType: 'REGULAR',
  lrNo: 'LR-998822',
  lrDate: new Date('2026-03-01'),
  distanceKm: 240,
  shipTo: {
    name: 'Reliance Hub Pune',
    gstin: '27AABCR9999P1ZA',
    address: 'Plot 45, Hinjewadi Phase 1',
    city: 'Pune',
    state: 'Maharashtra',
    stateCode: '27',
    pincode: '411057',
  },
  splitPayments: [
    { mode: 'CASH', amount: 50000 },
    { mode: 'UPI', amount: 50890, referenceNo: 'UPI/99887766' }
  ]
});

const txnErr = dummyTxn.validateSync();
assert(!txnErr, `PaymentTransaction validation for CREDIT_NOTE & Logistics: ${txnErr ? txnErr.message : 'Clean'}`);
assert(dummyTxn.txnType === 'CREDIT_NOTE', 'txnType set to CREDIT_NOTE correctly');
assert(dummyTxn.eWayBillNo === '121234567890', 'eWayBillNo stored correctly');
assert(dummyTxn.shipTo.city === 'Pune', 'Consignee Ship-To address stored correctly');
assert(dummyTxn.splitPayments.length === 2, 'Split payments array stored correctly');

console.log('\n--- 2. Testing Delivery Challan & Debit Note Types ---');
const debitTxn = new PaymentTransaction({
  tenantId: new mongoose.Types.ObjectId(),
  companyId: new mongoose.Types.ObjectId(),
  voucherNo: 'DBN-2526-0001',
  txnType: 'DEBIT_NOTE',
  partyType: 'SUPPLIER',
  partyName: 'Tata Steel Tubes',
  items: [{ productName: 'Steel Pipe 2 Inch', qty: 10, unitPrice: 500, taxPct: 18, taxableAmount: 5000, totalAmount: 5900 }],
  subtotal: 5000,
  taxTotal: 900,
  totalAmount: 5900,
  amount: 5900,
});
assert(!debitTxn.validateSync(), 'DEBIT_NOTE txnType valid');

const dcTxn = new PaymentTransaction({
  tenantId: new mongoose.Types.ObjectId(),
  companyId: new mongoose.Types.ObjectId(),
  voucherNo: 'DC-2526-0001',
  txnType: 'DELIVERY_CHALLAN',
  partyType: 'CUSTOMER',
  partyName: 'Job Work Facility 1',
  items: [{ productName: 'Brass Castings', qty: 100, unitPrice: 0, taxPct: 0, taxableAmount: 0, totalAmount: 0 }],
  subtotal: 0,
  taxTotal: 0,
  totalAmount: 0,
  amount: 0,
});
assert(!dcTxn.validateSync(), 'DELIVERY_CHALLAN txnType valid');

console.log('\n--- 3. Testing Supplier MSME Section 43B(h) Extensions ---');
const dummySup = new Supplier({
  tenantId: new mongoose.Types.ObjectId(),
  name: 'Apex Precision Engineering',
  contactName: 'Suresh Patil',
  phone: '9822012345',
  gstin: '27AAACA1234A1Z5',
  msmeType: 'MICRO',
  udyamNumber: 'UDYAM-MH-12-0012345',
  msmeAgreedDays: 45,
});

const supErr = dummySup.validateSync();
assert(!supErr, `Supplier MSME validation: ${supErr ? supErr.message : 'Clean'}`);
assert(dummySup.msmeType === 'MICRO', 'msmeType correctly stored as MICRO');
assert(dummySup.udyamNumber === 'UDYAM-MH-12-0012345', 'Udyam registration number verified');
assert(dummySup.msmeAgreedDays === 45, 'Statutory agreed days verified');

console.log('\n--- 4. Testing Statutory Round-Off Formula ---');
function calcAutoRoundOff(subtotal, disc, tax, extra) {
  const rawTotal = subtotal - disc + tax + extra;
  const rounded = Math.round(rawTotal);
  const roundOff = Math.round((rounded - rawTotal) * 100) / 100;
  return { rawTotal, rounded, roundOff };
}

const test1 = calcAutoRoundOff(100.40, 0, 18.07, 0); // 118.47 -> 118.00 (-0.47)
assert(test1.rounded === 118 && test1.roundOff === -0.47, `Round-off test 1: 118.47 -> rounded ${test1.rounded}, roundOff ${test1.roundOff}`);

const test2 = calcAutoRoundOff(500.00, 25.00, 85.54, 10.00); // 570.54 -> 571.00 (+0.46)
assert(test2.rounded === 571 && test2.roundOff === 0.46, `Round-off test 2: 570.54 -> rounded ${test2.rounded}, roundOff ${test2.roundOff}`);

console.log('\n🎉 ALL STATUTORY SCHEMA & CALCULATION TESTS PASSED SUCCESSFULLY!\n');
