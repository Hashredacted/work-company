'use strict';
require('dotenv').config({ path: '../../.env' });
const mongoose = require('mongoose');
const Supplier = require('../models/inv/Supplier');
const Customer = require('../models/inv/Customer');
const Payment = require('../models/inv/PaymentTransaction');
const PurchaseOrder = require('../models/inv/PurchaseOrder');
const SalesOrder = require('../models/inv/SalesOrder');
const StockLedger = require('../models/inv/StockLedger');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  // 1. Deduplicate Suppliers by (tenantId + name)
  const suppliers = await Supplier.find({}).lean();
  const suppGroups = {};
  for (const s of suppliers) {
    const key = `${s.tenantId}_${(s.name || '').trim().toLowerCase()}`;
    if (!suppGroups[key]) suppGroups[key] = [];
    suppGroups[key].push(s);
  }

  for (const [key, list] of Object.entries(suppGroups)) {
    if (list.length > 1) {
      console.log(`Found ${list.length} duplicates for Supplier: ${key}`);
      let bestSupp = list[0];
      let maxRefs = -1;
      for (const s of list) {
        const payCount = await Payment.countDocuments({ partyId: s._id });
        const poCount = await PurchaseOrder.countDocuments({ supplierId: s._id });
        const stockCount = await StockLedger.countDocuments({ supplierId: s._id });
        const totalRefs = payCount + poCount + stockCount;
        console.log(`  -> Supplier ${s._id} (${s.phone}): refs=${totalRefs}`);
        if (totalRefs > maxRefs) {
          maxRefs = totalRefs;
          bestSupp = s;
        }
      }

      console.log(`  ==> Keeping primary: ${bestSupp._id}`);
      for (const s of list) {
        if (s._id.toString() !== bestSupp._id.toString()) {
          await Payment.updateMany({ partyId: s._id }, { $set: { partyId: bestSupp._id } });
          await PurchaseOrder.updateMany({ supplierId: s._id }, { $set: { supplierId: bestSupp._id } });
          await StockLedger.updateMany({ supplierId: s._id }, { $set: { supplierId: bestSupp._id } });
          await Supplier.deleteOne({ _id: s._id });
          console.log(`  Deleted duplicate supplier: ${s._id}`);
        }
      }
    }
  }

  // 2. Deduplicate Customers by (tenantId + name)
  const customers = await Customer.find({}).lean();
  const custGroups = {};
  for (const c of customers) {
    const key = `${c.tenantId}_${(c.name || '').trim().toLowerCase()}`;
    if (!custGroups[key]) custGroups[key] = [];
    custGroups[key].push(c);
  }

  for (const [key, list] of Object.entries(custGroups)) {
    if (list.length > 1) {
      console.log(`Found ${list.length} duplicates for Customer: ${key}`);
      let bestCust = list[0];
      let maxRefs = -1;
      for (const c of list) {
        const payCount = await Payment.countDocuments({ partyId: c._id });
        const soCount = await SalesOrder.countDocuments({ customerId: c._id });
        const stockCount = await StockLedger.countDocuments({ customerId: c._id });
        const totalRefs = payCount + soCount + stockCount;
        console.log(`  -> Customer ${c._id} (${c.phone}): refs=${totalRefs}`);
        if (totalRefs > maxRefs) {
          maxRefs = totalRefs;
          bestCust = c;
        }
      }

      console.log(`  ==> Keeping primary: ${bestCust._id}`);
      for (const c of list) {
        if (c._id.toString() !== bestCust._id.toString()) {
          await Payment.updateMany({ partyId: c._id }, { $set: { partyId: bestCust._id } });
          await SalesOrder.updateMany({ customerId: c._id }, { $set: { customerId: bestCust._id } });
          await StockLedger.updateMany({ customerId: c._id }, { $set: { customerId: bestCust._id } });
          await Customer.deleteOne({ _id: c._id });
          console.log(`  Deleted duplicate customer: ${c._id}`);
        }
      }
    }
  }

  console.log('✅ Cleanup complete!');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
