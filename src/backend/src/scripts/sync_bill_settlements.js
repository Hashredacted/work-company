'use strict';
/**
 * Migration: Sync settledAmount + paymentStatus on existing BILL / INVOICE records
 * that already have matched PAYMENT_IN / PAYMENT_OUT vouchers.
 *
 * Run once: node src/scripts/sync_bill_settlements.js
 */
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
const mongoose = require('mongoose');
const PaymentTransaction = require('../models/inv/PaymentTransaction');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Find all PAYMENT_IN / PAYMENT_OUT vouchers that have allocatedBills linked
  const payments = await PaymentTransaction.find({
    txnType: { $in: ['PAYMENT_IN', 'PAYMENT_OUT'] },
    'allocatedBills.0': { $exists: true },
  }).lean();

  console.log(`Found ${payments.length} payments with allocatedBills links`);

  for (const payment of payments) {
    for (const alloc of payment.allocatedBills) {
      if (!alloc.billId || !alloc.allocatedAmount) continue;

      const bill = await PaymentTransaction.findById(alloc.billId).lean();
      if (!bill) continue;

      // Recompute total settled on this bill from all payment allocations pointing to it
      const allPaymentsForBill = await PaymentTransaction.find({
        'allocatedBills.billId': alloc.billId,
      }).lean();

      const totalSettled = allPaymentsForBill.reduce((sum, p) => {
        const linked = p.allocatedBills.find(b => b.billId?.toString() === alloc.billId.toString());
        return sum + (linked?.allocatedAmount || 0);
      }, 0);

      const newStatus = totalSettled >= bill.amount ? 'PAID' : totalSettled > 0 ? 'PARTIALLY_PAID' : 'UNPAID';

      if (bill.settledAmount !== totalSettled || bill.paymentStatus !== newStatus) {
        await PaymentTransaction.updateOne(
          { _id: bill._id },
          { $set: { settledAmount: totalSettled, paymentStatus: newStatus } }
        );
        console.log(`  Synced ${bill.voucherNo}: settledAmount=${totalSettled} status=${newStatus}`);
      }
    }
  }

  // Also find bills/invoices that have PAYMENT records by partyId but no allocatedBills link
  // (old-style payments created before bill-wise knockoff was implemented)
  const unlinkedBills = await PaymentTransaction.find({
    txnType: { $in: ['BILL', 'INVOICE'] },
    $or: [
      { paymentStatus: { $in: ['UNPAID', null] } },
      { settledAmount: { $lte: 0 } },
    ],
  }).lean();

  console.log(`\nFound ${unlinkedBills.length} unlinked bills/invoices to check`);

  for (const bill of unlinkedBills) {
    const paymentTxnType = bill.txnType === 'INVOICE' ? 'PAYMENT_IN' : 'PAYMENT_OUT';

    // Sum all PAYMENT_IN/OUT for this party that don't have allocatedBills (on-account / old-style)
    // We can only do approximate attribution here — skip for safety, only sync those with direct links
    // Check if there are direct allocation links pointing to this bill
    const directAllocs = await PaymentTransaction.find({
      'allocatedBills.billId': bill._id,
    }).lean();

    if (directAllocs.length === 0) continue; // no direct link, skip

    const totalSettled = directAllocs.reduce((sum, p) => {
      const linked = p.allocatedBills.find(b => b.billId?.toString() === bill._id.toString());
      return sum + (linked?.allocatedAmount || 0);
    }, 0);

    const newStatus = totalSettled >= bill.amount ? 'PAID' : totalSettled > 0 ? 'PARTIALLY_PAID' : 'UNPAID';

    if (bill.settledAmount !== totalSettled || bill.paymentStatus !== newStatus) {
      await PaymentTransaction.updateOne(
        { _id: bill._id },
        { $set: { settledAmount: totalSettled, paymentStatus: newStatus } }
      );
      console.log(`  Synced (unlinked) ${bill.voucherNo}: settledAmount=${totalSettled} status=${newStatus}`);
    }
  }

  console.log('\n✅ Settlement sync complete');
  process.exit(0);
}

run().catch(err => { console.error('Error:', err); process.exit(1); });
