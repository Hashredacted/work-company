'use strict';

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const { connectDB } = require('../config/db');
const Tenant = require('../models/Tenant');
const Customer = require('../models/inv/Customer');
const Supplier = require('../models/inv/Supplier');
const Warehouse = require('../models/inv/Warehouse');
const PaymentTransaction = require('../models/inv/PaymentTransaction');
const User = require('../models/User');

async function seedTenantCases(tenant) {
  console.log(`\n[Seed] >>> Seeding for Tenant: ${tenant.name} (${tenant._id})`);

  let adminUser = await User.findOne({ tenantId: tenant._id });
  if (!adminUser) {
    adminUser = await User.findOne({});
  }

  // Clear existing payments for clean seed run
  await PaymentTransaction.deleteMany({ tenantId: tenant._id });

  // Ensure Warehouse
  let warehouse = await Warehouse.findOne({ tenantId: tenant._id, isActive: true });
  if (!warehouse) {
    warehouse = await Warehouse.create({
      tenantId: tenant._id,
      name: 'Main Central Godown',
      code: 'WH-MAIN',
      city: 'Mumbai',
      state: 'Maharashtra',
      isDefault: true,
    });
  }

  // ─── 1. Demo Customers ──────────────────────────────────────────────────────
  const customersData = [
    {
      name: 'Sharma Retail Store',
      contactName: 'Rohit Sharma',
      phone: '9820011223',
      email: 'rohit@sharmaretail.in',
      gstin: '27AABCS1429B1Z1',
      state: 'Maharashtra',
      stateCode: '27',
      city: 'Mumbai',
      pincode: '400001',
      billingAddress: 'Shop 14, Linking Road, Bandra West, Mumbai',
      paymentTerms: 15,
      creditLimit: 50000,
    },
    {
      name: 'Apex Tech Distributors',
      contactName: 'Vikram Mehta',
      phone: '9821122334',
      email: 'sales@apextech.in',
      gstin: '27AAACA1234A1Z5',
      state: 'Maharashtra',
      stateCode: '27',
      city: 'Pune',
      pincode: '411004',
      billingAddress: 'Plot 45, Hadapsar Industrial Estate, Pune',
      paymentTerms: 30,
      creditLimit: 200000,
    },
    {
      name: 'Gupta General Trading Co.',
      contactName: 'Suresh Gupta',
      phone: '9833344556',
      email: 'suresh@guptatraders.co.in',
      gstin: '27AABCG5555C1Z9',
      state: 'Maharashtra',
      stateCode: '27',
      city: 'Nagpur',
      pincode: '440002',
      billingAddress: 'Itwari Wholesale Market, Nagpur',
      paymentTerms: 30,
      creditLimit: 75000,
    },
    {
      name: 'Kalyan Electronics (Cash & Carry)',
      contactName: 'Kalyan Sundaram',
      phone: '9819988776',
      email: 'kalyan@kalyanelec.in',
      gstin: '27AAACK9876D1Z2',
      state: 'Maharashtra',
      stateCode: '27',
      city: 'Thane',
      pincode: '400601',
      billingAddress: 'Gokhale Road, Naupada, Thane West',
      paymentTerms: 0,
      creditLimit: 0,
    },
    {
      name: 'Metro IT Solutions',
      contactName: 'Priya Deshmukh',
      phone: '9820556677',
      email: 'accounts@metroit.com',
      gstin: '27AAACM4321E1Z8',
      state: 'Maharashtra',
      stateCode: '27',
      city: 'Navi Mumbai',
      pincode: '400705',
      billingAddress: 'Sector 17, Vashi, Navi Mumbai',
      paymentTerms: 15,
      creditLimit: 100000,
    },
  ];

  const customers = {};
  for (const c of customersData) {
    let doc = await Customer.findOne({ tenantId: tenant._id, name: c.name });
    if (!doc) {
      doc = await Customer.create({ tenantId: tenant._id, ...c });
    } else {
      await Customer.updateOne({ _id: doc._id }, { $set: c });
    }
    customers[c.name] = doc;
  }

  // ─── 2. Demo Suppliers ──────────────────────────────────────────────────────
  const suppliersData = [
    {
      name: 'Bharat Electronics Distributors',
      contactName: 'Anil Agarwal',
      phone: '9811122334',
      email: 'orders@bharatelectronics.com',
      gstin: '27AABCB9999F1Z3',
      state: 'Maharashtra',
      stateCode: '27',
      city: 'Mumbai',
      pincode: '400002',
      address: 'Lamington Road, Grant Road East, Mumbai',
      paymentTerms: 30,
      creditLimit: 300000,
      bankDetails: { bankName: 'HDFC Bank', accountNo: '50200012345678', ifsc: 'HDFC0000123' },
    },
    {
      name: 'SuperTech Component Suppliers',
      contactName: 'Rajesh Kulkarni',
      phone: '9822233445',
      email: 'rajesh@supertech.co.in',
      gstin: '27AAACS7777G1Z4',
      state: 'Maharashtra',
      stateCode: '27',
      city: 'Nashik',
      pincode: '422007',
      address: 'Ambad MIDC, Nashik',
      paymentTerms: 45,
      creditLimit: 250000,
      bankDetails: { bankName: 'State Bank of India', accountNo: '30998877665', ifsc: 'SBIN0001234' },
    },
  ];

  const suppliers = {};
  for (const s of suppliersData) {
    let doc = await Supplier.findOne({ tenantId: tenant._id, name: s.name });
    if (!doc) {
      doc = await Supplier.create({ tenantId: tenant._id, ...s });
    } else {
      await Supplier.updateOne({ _id: doc._id }, { $set: s });
    }
    suppliers[s.name] = doc;
  }

  const d = (daysAgo) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - daysAgo);
    return dt;
  };

  // Case 1: VIP Clean Payer (Sharma Retail Store)
  const cSharma = customers['Sharma Retail Store'];
  const inv1 = await PaymentTransaction.create({
    tenantId: tenant._id,
    voucherNo: 'INV-2627-0101',
    partyType: 'CUSTOMER',
    partyId: cSharma._id,
    partyModel: 'InvCustomer',
    txnType: 'INVOICE',
    amount: 15000,
    paymentMode: 'CREDIT',
    paymentDate: d(10),
    dueDate: d(-5),
    settledAmount: 15000,
    paymentStatus: 'PAID',
    notes: 'Sale of 50 Pcs HDMI Cables',
    createdBy: adminUser._id,
  });

  await PaymentTransaction.create({
    tenantId: tenant._id,
    voucherNo: 'REC-2627-0101',
    partyType: 'CUSTOMER',
    partyId: cSharma._id,
    partyModel: 'InvCustomer',
    txnType: 'PAYMENT_IN',
    amount: 15000,
    paymentMode: 'UPI',
    paymentDate: d(10),
    referenceNo: '423611223344',
    notes: 'Full payment received via Google Pay [Settled: INV-2627-0101 (₹15,000)]',
    allocatedBills: [{ billId: inv1._id, voucherNo: 'INV-2627-0101', allocatedAmount: 15000, remainingBillBalance: 0 }],
    createdBy: adminUser._id,
  });

  // Case 2: Multi-Installment Split (Apex Tech Distributors)
  const cApex = customers['Apex Tech Distributors'];
  const inv2 = await PaymentTransaction.create({
    tenantId: tenant._id,
    voucherNo: 'INV-2627-0102',
    partyType: 'CUSTOMER',
    partyId: cApex._id,
    partyModel: 'InvCustomer',
    txnType: 'INVOICE',
    amount: 125000,
    paymentMode: 'CREDIT',
    paymentDate: d(18),
    dueDate: d(-12),
    settledAmount: 75000,
    paymentStatus: 'PARTIALLY_PAID',
    notes: 'Wholesale Invoice for Network Switches & Routers (₹1,25,000)',
    createdBy: adminUser._id,
  });

  await PaymentTransaction.create({
    tenantId: tenant._id,
    voucherNo: 'REC-2627-0102',
    partyType: 'CUSTOMER',
    partyId: cApex._id,
    partyModel: 'InvCustomer',
    txnType: 'PAYMENT_IN',
    amount: 40000,
    paymentMode: 'NEFT_RTGS',
    paymentDate: d(14),
    referenceNo: 'HDFCN2608149911',
    notes: 'Part Payment Part 1 via NEFT [Settled: INV-2627-0102 (₹40,000)]',
    allocatedBills: [{ billId: inv2._id, voucherNo: 'INV-2627-0102', allocatedAmount: 40000, remainingBillBalance: 85000 }],
    createdBy: adminUser._id,
  });

  await PaymentTransaction.create({
    tenantId: tenant._id,
    voucherNo: 'REC-2627-0103',
    partyType: 'CUSTOMER',
    partyId: cApex._id,
    partyModel: 'InvCustomer',
    txnType: 'PAYMENT_IN',
    amount: 35000,
    paymentMode: 'CHEQUE',
    paymentDate: d(5),
    referenceNo: '003921 (ICICI Bank)',
    notes: 'Part Payment Part 2 via Cheque Cleared [Settled: INV-2627-0102 (₹35,000)]',
    allocatedBills: [{ billId: inv2._id, voucherNo: 'INV-2627-0102', allocatedAmount: 35000, remainingBillBalance: 50000 }],
    createdBy: adminUser._id,
  });

  // Case 3: Critical Overdue Debtor (Gupta General Trading Co.)
  const cGupta = customers['Gupta General Trading Co.'];
  await PaymentTransaction.create({
    tenantId: tenant._id,
    voucherNo: 'INV-2627-0103',
    partyType: 'CUSTOMER',
    partyId: cGupta._id,
    partyModel: 'InvCustomer',
    txnType: 'INVOICE',
    amount: 68500,
    paymentMode: 'CREDIT',
    paymentDate: d(60),
    dueDate: d(30),
    settledAmount: 0,
    paymentStatus: 'UNPAID',
    notes: 'Bulk Electrical Fittings & Cables (Overdue Credit)',
    createdBy: adminUser._id,
  });

  // Case 4: FIFO Supplier Knockoff (Bharat Electronics Distributors)
  const sBharat = suppliers['Bharat Electronics Distributors'];
  const bill1 = await PaymentTransaction.create({
    tenantId: tenant._id,
    voucherNo: 'BILL-2627-0101',
    partyType: 'SUPPLIER',
    partyId: sBharat._id,
    partyModel: 'InvSupplier',
    txnType: 'BILL',
    amount: 18000,
    paymentMode: 'CREDIT',
    paymentDate: d(25),
    dueDate: d(-5),
    settledAmount: 18000,
    paymentStatus: 'PAID',
    notes: 'Purchase of Display Panels Batch A',
    createdBy: adminUser._id,
  });

  const bill2 = await PaymentTransaction.create({
    tenantId: tenant._id,
    voucherNo: 'BILL-2627-0102',
    partyType: 'SUPPLIER',
    partyId: sBharat._id,
    partyModel: 'InvSupplier',
    txnType: 'BILL',
    amount: 24000,
    paymentMode: 'CREDIT',
    paymentDate: d(15),
    dueDate: d(-15),
    settledAmount: 12000,
    paymentStatus: 'PARTIALLY_PAID',
    notes: 'Purchase of Display Panels Batch B',
    createdBy: adminUser._id,
  });

  await PaymentTransaction.create({
    tenantId: tenant._id,
    voucherNo: 'BILL-2627-0103',
    partyType: 'SUPPLIER',
    partyId: sBharat._id,
    partyModel: 'InvSupplier',
    txnType: 'BILL',
    amount: 15000,
    paymentMode: 'CREDIT',
    paymentDate: d(5),
    dueDate: d(-25),
    settledAmount: 0,
    paymentStatus: 'UNPAID',
    notes: 'Purchase of Connectors & Adapters',
    createdBy: adminUser._id,
  });

  await PaymentTransaction.create({
    tenantId: tenant._id,
    voucherNo: 'PAY-2627-0101',
    partyType: 'SUPPLIER',
    partyId: sBharat._id,
    partyModel: 'InvSupplier',
    txnType: 'PAYMENT_OUT',
    amount: 30000,
    paymentMode: 'NEFT_RTGS',
    paymentDate: d(3),
    referenceNo: 'SBIN2608234455',
    notes: 'FIFO Settlement for Bills [Settled: BILL-2627-0101 (₹18,000), BILL-2627-0102 (₹12,000)]',
    allocatedBills: [
      { billId: bill1._id, voucherNo: 'BILL-2627-0101', allocatedAmount: 18000, remainingBillBalance: 0 },
      { billId: bill2._id, voucherNo: 'BILL-2627-0102', allocatedAmount: 12000, remainingBillBalance: 12000 },
    ],
    createdBy: adminUser._id,
  });

  // Case 5: Section 269ST Compliant Cash Receipt (Kalyan Electronics)
  const cKalyan = customers['Kalyan Electronics (Cash & Carry)'];
  const inv4 = await PaymentTransaction.create({
    tenantId: tenant._id,
    voucherNo: 'INV-2627-0104',
    partyType: 'CUSTOMER',
    partyId: cKalyan._id,
    partyModel: 'InvCustomer',
    txnType: 'INVOICE',
    amount: 140000,
    paymentMode: 'CREDIT',
    paymentDate: d(2),
    dueDate: d(2),
    settledAmount: 140000,
    paymentStatus: 'PAID',
    notes: 'Cash & Carry Bulk Purchase (Audio Amplifiers)',
    createdBy: adminUser._id,
  });

  await PaymentTransaction.create({
    tenantId: tenant._id,
    voucherNo: 'REC-2627-0104',
    partyType: 'CUSTOMER',
    partyId: cKalyan._id,
    partyModel: 'InvCustomer',
    txnType: 'PAYMENT_IN',
    amount: 140000,
    paymentMode: 'CASH',
    paymentDate: d(2),
    referenceNo: 'CR-2026-88',
    notes: 'Cash Counter Receipt [Compliant Section 269ST < ₹2L] [Settled: INV-2627-0104 (₹1,40,000)]',
    allocatedBills: [{ billId: inv4._id, voucherNo: 'INV-2627-0104', allocatedAmount: 140000, remainingBillBalance: 0 }],
    createdBy: adminUser._id,
  });

  // Case 6: Advance / On-Account Payment (Metro IT Solutions)
  const cMetro = customers['Metro IT Solutions'];
  await PaymentTransaction.create({
    tenantId: tenant._id,
    voucherNo: 'REC-2627-0105',
    partyType: 'CUSTOMER',
    partyId: cMetro._id,
    partyModel: 'InvCustomer',
    txnType: 'PAYMENT_IN',
    amount: 25000,
    paymentMode: 'UPI',
    paymentDate: d(1),
    referenceNo: '423699887766',
    notes: 'Advance on-account payment via PhonePe for upcoming Q3 hardware deployment',
    allocatedBills: [],
    createdBy: adminUser._id,
  });

  // Case 7: Post-Dated Cheque / Bank Realization (SuperTech Component Suppliers)
  const sSuper = suppliers['SuperTech Component Suppliers'];
  const bill4 = await PaymentTransaction.create({
    tenantId: tenant._id,
    voucherNo: 'BILL-2627-0104',
    partyType: 'SUPPLIER',
    partyId: sSuper._id,
    partyModel: 'InvSupplier',
    txnType: 'BILL',
    amount: 42000,
    paymentMode: 'CREDIT',
    paymentDate: d(7),
    dueDate: d(-38),
    settledAmount: 42000,
    paymentStatus: 'PAID',
    notes: 'Raw Materials & PCB Components Supply',
    createdBy: adminUser._id,
  });

  await PaymentTransaction.create({
    tenantId: tenant._id,
    voucherNo: 'PAY-2627-0102',
    partyType: 'SUPPLIER',
    partyId: sSuper._id,
    partyModel: 'InvSupplier',
    txnType: 'PAYMENT_OUT',
    amount: 42000,
    paymentMode: 'CHEQUE',
    paymentDate: d(1),
    referenceNo: '004812 (HDFC Bank)',
    bankAccount: 'HDFC Bank - A/C 50200012345678',
    notes: 'Cheque Realized & Cleared for Bill [Settled: BILL-2627-0104 (₹42,000)]',
    allocatedBills: [{ billId: bill4._id, voucherNo: 'BILL-2627-0104', allocatedAmount: 42000, remainingBillBalance: 0 }],
    createdBy: adminUser._id,
  });

  console.log(`[Seed] Successfully populated all 7 payment cases for ${tenant.name}.`);
}

async function seedAll() {
  await connectDB();
  console.log('[Seed] Connected to MongoDB');

  const tenants = await Tenant.find({ deletedAt: null });
  console.log(`[Seed] Found ${tenants.length} active tenants.`);

  for (const t of tenants) {
    await seedTenantCases(t);
  }

  console.log('\n====================================================');
  console.log('ALL ACTIVE TENANTS POPULATED WITH 7 REALISTIC CASES! ✅');
  console.log('====================================================');
  process.exit(0);
}

seedAll().catch(err => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});
