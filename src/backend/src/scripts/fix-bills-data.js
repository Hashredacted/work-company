'use strict';

const mongoose = require('mongoose');
const path = require('path');

// Load env — try multiple paths
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) { console.error('No MONGO_URI found in .env'); process.exit(1); }

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('[DB] Connected');

  const db = mongoose.connection.db;
  const col = db.collection('invpaymenttransactions');

  // 1. Inspect sample records
  console.log('\n=== SAMPLE BILL/INVOICE RECORDS ===');
  const samples = await col.find({ txnType: { $in: ['INVOICE', 'BILL'] } })
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();

  samples.forEach(s => {
    console.log({
      _id: s._id,
      voucherNo: s.voucherNo,
      txnType: s.txnType,
      paymentDate: s.paymentDate,
      date: s.date,
      paymentMode: s.paymentMode,
      paymentStatus: s.paymentStatus,
      settledAmount: s.settledAmount,
      amount: s.amount,
    });
  });

  // 2. Diagnostics
  const total = await col.countDocuments({ txnType: { $in: ['INVOICE', 'BILL'] } });
  const noPaymentDate = await col.countDocuments({ txnType: { $in: ['INVOICE', 'BILL'] }, paymentDate: { $exists: false } });
  const nullPaymentDate = await col.countDocuments({ txnType: { $in: ['INVOICE', 'BILL'] }, paymentDate: null });
  const noPaymentMode = await col.countDocuments({ txnType: { $in: ['INVOICE', 'BILL'] }, paymentMode: { $exists: false } });
  const nullPaymentMode = await col.countDocuments({ txnType: { $in: ['INVOICE', 'BILL'] }, paymentMode: null });
  const hasOnlyDate = await col.countDocuments({ txnType: { $in: ['INVOICE', 'BILL'] }, paymentDate: { $exists: false }, date: { $exists: true } });

  const modeAgg = await col.aggregate([
    { $match: { txnType: { $in: ['INVOICE', 'BILL'] } } },
    { $group: { _id: '$paymentMode', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();

  console.log('\n=== DIAGNOSTICS ===');
  console.log('Total INVOICE/BILL records :', total);
  console.log('Missing paymentDate field  :', noPaymentDate);
  console.log('paymentDate = null         :', nullPaymentDate);
  console.log('Has date field only        :', hasOnlyDate);
  console.log('Missing paymentMode field  :', noPaymentMode);
  console.log('paymentMode = null         :', nullPaymentMode);
  console.log('paymentMode distribution   :', modeAgg);

  // 3. Fix: copy date -> paymentDate where paymentDate is missing
  if (noPaymentDate > 0 || nullPaymentDate > 0) {
    console.log('\n[FIX 1] Copying date -> paymentDate for records missing paymentDate...');
    const r1 = await col.updateMany(
      { txnType: { $in: ['INVOICE', 'BILL'] }, date: { $exists: true, $ne: null }, $or: [{ paymentDate: { $exists: false } }, { paymentDate: null }] },
      [{ $set: { paymentDate: '$date' } }]
    );
    console.log('  Updated:', r1.modifiedCount, 'records');
    // Fallback: use createdAt
    const r2 = await col.updateMany(
      { txnType: { $in: ['INVOICE', 'BILL'] }, $or: [{ paymentDate: { $exists: false } }, { paymentDate: null }] },
      [{ $set: { paymentDate: '$createdAt' } }]
    );
    console.log('  Fallback (createdAt):', r2.modifiedCount, 'records');
  } else {
    console.log('\n[FIX 1] All records already have paymentDate. Skipped.');
  }

  // 4. Sync paymentDate -> date where date is missing
  const missingDate = await col.countDocuments({ txnType: { $in: ['INVOICE', 'BILL'] }, date: { $exists: false } });
  if (missingDate > 0) {
    console.log('\n[FIX 2] Syncing paymentDate -> date field...');
    const r3 = await col.updateMany(
      { txnType: { $in: ['INVOICE', 'BILL'] }, date: { $exists: false }, paymentDate: { $exists: true, $ne: null } },
      [{ $set: { date: '$paymentDate' } }]
    );
    console.log('  Updated:', r3.modifiedCount, 'records');
  } else {
    console.log('\n[FIX 2] All records already have date field. Skipped.');
  }

  // 5. Normalize paymentMode enum values
  const modeFixMap = [
    { from: 'NEFT_RTGS',   to: 'BANK_TRANSFER' },
    { from: 'NET_BANKING', to: 'BANK_TRANSFER' },
    { from: 'TRANSFER',    to: 'BANK_TRANSFER' },
    { from: 'ONLINE',      to: 'UPI' },
  ];
  console.log('\n[FIX 3] Normalizing paymentMode values...');
  for (const { from, to } of modeFixMap) {
    const r = await col.updateMany(
      { txnType: { $in: ['INVOICE', 'BILL'] }, paymentMode: from },
      { $set: { paymentMode: to } }
    );
    if (r.modifiedCount > 0) console.log(' ', from, '->', to, ':', r.modifiedCount, 'records');
  }
  // Default missing paymentMode
  const r4 = await col.updateMany(
    { txnType: { $in: ['INVOICE', 'BILL'] }, $or: [{ paymentMode: { $exists: false } }, { paymentMode: null }, { paymentMode: '' }] },
    { $set: { paymentMode: 'CASH' } }
  );
  if (r4.modifiedCount > 0) console.log('  Default CASH set for:', r4.modifiedCount, 'records');

  // 6. Normalize paymentStatus
  console.log('\n[FIX 4] Normalizing paymentStatus...');
  const statusAgg = await col.aggregate([
    { $match: { txnType: { $in: ['INVOICE', 'BILL'] } } },
    { $group: { _id: '$paymentStatus', count: { $sum: 1 } } }
  ]).toArray();
  console.log('  Current distribution:', statusAgg);

  // PARTIAL -> PARTIALLY_PAID (model enum)
  const r5 = await col.updateMany(
    { txnType: { $in: ['INVOICE', 'BILL'] }, paymentStatus: 'PARTIAL' },
    { $set: { paymentStatus: 'PARTIALLY_PAID' } }
  );
  if (r5.modifiedCount > 0) console.log('  PARTIAL -> PARTIALLY_PAID:', r5.modifiedCount, 'records');

  // 7. Final verification
  console.log('\n=== POST-MIGRATION VERIFICATION ===');
  const finalNoPaymentDate = await col.countDocuments({ txnType: { $in: ['INVOICE', 'BILL'] }, $or: [{ paymentDate: { $exists: false } }, { paymentDate: null }] });
  const finalNoMode = await col.countDocuments({ txnType: { $in: ['INVOICE', 'BILL'] }, $or: [{ paymentMode: { $exists: false } }, { paymentMode: null }] });
  const finalModeAgg = await col.aggregate([
    { $match: { txnType: { $in: ['INVOICE', 'BILL'] } } },
    { $group: { _id: '$paymentMode', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  console.log('Records still missing paymentDate:', finalNoPaymentDate);
  console.log('Records still missing paymentMode:', finalNoMode);
  console.log('Final paymentMode distribution:', finalModeAgg);
  console.log('\nMigration complete.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e => {
  console.error('Migration error:', e.message);
  process.exit(1);
});
