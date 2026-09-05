'use strict';
/**
 * Seed products, categories, suppliers, customers, warehouses, stock,
 * bills & invoices into a SPECIFIC existing tenant by email.
 * Usage: node src/scripts/seed-tenant.js <userEmail>
 * Example: node src/scripts/seed-tenant.js admin1061@afnanenterprises.in
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const Warehouse   = require('../models/inv/Warehouse');
const InvCategory = require('../models/inv/Category');
const InvProduct  = require('../models/inv/Product');
const InvSupplier = require('../models/inv/Supplier');
const InvCustomer = require('../models/inv/Customer');
const InvStockLedger = require('../models/inv/StockLedger');
const InvPaymentTransaction = require('../models/inv/PaymentTransaction');
const BankAccount = require('../models/inv/BankAccount');
const User = require('../models/User');

const TARGET_EMAIL = process.argv[2] || 'admin1061@afnanenterprises.in';

async function seedTenant() {
  const URI = process.env.MONGODB_URI || process.env.MONGO_URI;
  await mongoose.connect(URI);
  console.log('[DB] Connected:', mongoose.connection.name);

  // Find the user and their tenant
  const user = await User.findOne({ email: TARGET_EMAIL });
  if (!user) { console.error(`User ${TARGET_EMAIL} not found`); process.exit(1); }
  const tenantId = user.tenantId;
  const userId = user._id;

  console.log(`\nSeeding into tenant: ${tenantId} (user: ${TARGET_EMAIL})`);

  // Clean existing inventory data for this tenant
  console.log('[Clean] Removing old inventory data...');
  await Promise.all([
    InvPaymentTransaction.deleteMany({ tenantId }),
    InvStockLedger.deleteMany({ tenantId }),
    InvProduct.deleteMany({ tenantId }),
    InvCategory.deleteMany({ tenantId }),
    InvSupplier.deleteMany({ tenantId }),
    InvCustomer.deleteMany({ tenantId }),
    Warehouse.deleteMany({ tenantId }),
    BankAccount.deleteMany({ tenantId }),
  ]);
  console.log('[Clean] Done.');

  // ─── Warehouses ────────────────────────────────────────────────
  const whGodown = await Warehouse.create({
    tenantId, name: 'Main Godown & Central Hub', code: 'WH-01',
    type: 'OWNED', city: 'Mumbai', state: 'Maharashtra', stateCode: '27',
    pincode: '400001', isDefault: true,
  });
  const whCounter = await Warehouse.create({
    tenantId, name: 'Retail Storefront Counter', code: 'WH-02',
    type: 'OWNED', city: 'Mumbai', state: 'Maharashtra', stateCode: '27',
    pincode: '400053', isDefault: false,
  });
  console.log('[Seed] ✓ Warehouses');

  // ─── Categories ─────────────────────────────────────────────────
  const catElectronics = await InvCategory.create({ tenantId, name: 'Consumer Electronics', description: 'Smartphones, Audio & Accessories' });
  const catSmartphones = await InvCategory.create({ tenantId, name: 'Smartphones & Tablets', parentId: catElectronics._id });
  const catAudio       = await InvCategory.create({ tenantId, name: 'Audio & Wearables', parentId: catElectronics._id });
  const catAccessories = await InvCategory.create({ tenantId, name: 'Cables & Peripherals', parentId: catElectronics._id });
  const catFMCG        = await InvCategory.create({ tenantId, name: 'FMCG & Groceries', description: 'Packaged Food, Beverages & Personal Care' });
  const catBeverages   = await InvCategory.create({ tenantId, name: 'Tea, Coffee & Beverages', parentId: catFMCG._id });
  const catPersonalCare= await InvCategory.create({ tenantId, name: 'Personal Care & Hygiene', parentId: catFMCG._id });
  const catSnacks      = await InvCategory.create({ tenantId, name: 'Chocolates & Snacks', parentId: catFMCG._id });
  const catHome        = await InvCategory.create({ tenantId, name: 'Home & Kitchen', description: 'Appliances, Cooktops & Lighting' });
  const catAppliances  = await InvCategory.create({ tenantId, name: 'Kitchen Appliances', parentId: catHome._id });
  const catStationery  = await InvCategory.create({ tenantId, name: 'Office Supplies & Stationery', description: 'Pens, Notebooks & Desk Items' });
  console.log('[Seed] ✓ Categories');

  // ─── Products ───────────────────────────────────────────────────
  const productsData = [
    { name: 'OnePlus 12 5G (16GB/512GB Flowy Emerald)', sku: 'ELEC-OP12-512', barcode: '8901234500011', categoryId: catSmartphones._id, brand: 'OnePlus', unit: 'Pcs', hsnCode: '8517', gstRate: 18, mrp: 69999, purchasePrice: 54000, sellingPrice: 64999, trackingType: 'SERIAL', reorderLevel: 5, reorderQty: 20 },
    { name: 'Samsung Galaxy S24 Ultra (256GB Titanium)', sku: 'ELEC-S24U-256', barcode: '8901234500028', categoryId: catSmartphones._id, brand: 'Samsung', unit: 'Pcs', hsnCode: '8517', gstRate: 18, mrp: 129999, purchasePrice: 102000, sellingPrice: 119999, trackingType: 'SERIAL', reorderLevel: 3, reorderQty: 10 },
    { name: 'Apple AirPods Pro (2nd Gen with USB-C)', sku: 'ELEC-APP-PRO2', barcode: '8901234500035', categoryId: catAudio._id, brand: 'Apple', unit: 'Pcs', hsnCode: '8518', gstRate: 18, mrp: 24900, purchasePrice: 17500, sellingPrice: 22490, trackingType: 'SERIAL', reorderLevel: 5, reorderQty: 15 },
    { name: 'boAt Airdopes 441 True Wireless Earbuds', sku: 'ELEC-BOAT-441', barcode: '8901234500042', categoryId: catAudio._id, brand: 'boAt', unit: 'Pcs', hsnCode: '8518', gstRate: 18, mrp: 2999, purchasePrice: 850, sellingPrice: 1499, trackingType: 'NONE', reorderLevel: 10, reorderQty: 50 },
    { name: 'Sony WH-1000XM5 Wireless ANC Headphones', sku: 'ELEC-SONY-XM5', barcode: '8901234500059', categoryId: catAudio._id, brand: 'Sony', unit: 'Pcs', hsnCode: '8518', gstRate: 18, mrp: 34990, purchasePrice: 24000, sellingPrice: 29990, trackingType: 'SERIAL', reorderLevel: 4, reorderQty: 10 },
    { name: 'Anker 65W GaN Fast Wall Charger', sku: 'ACC-ANK-65W', barcode: '8901234500066', categoryId: catAccessories._id, brand: 'Anker', unit: 'Pcs', hsnCode: '8504', gstRate: 18, mrp: 3499, purchasePrice: 1400, sellingPrice: 2499, trackingType: 'NONE', reorderLevel: 15, reorderQty: 40 },
    { name: 'Braided Type-C to Type-C 100W Cable 2m', sku: 'ACC-USBC-2M', barcode: '8901234500073', categoryId: catAccessories._id, brand: 'Portronics', unit: 'Pcs', hsnCode: '8544', gstRate: 18, mrp: 799, purchasePrice: 180, sellingPrice: 499, trackingType: 'NONE', reorderLevel: 25, reorderQty: 100 },
    { name: 'Logitech MX Master 3S Wireless Mouse', sku: 'ACC-LOGI-MX3S', barcode: '8901234500080', categoryId: catAccessories._id, brand: 'Logitech', unit: 'Pcs', hsnCode: '8471', gstRate: 18, mrp: 10995, purchasePrice: 6800, sellingPrice: 8995, trackingType: 'NONE', reorderLevel: 6, reorderQty: 20 },
    { name: 'SanDisk Extreme 1TB Portable External SSD', sku: 'ACC-SAND-1TB', barcode: '8901234500097', categoryId: catAccessories._id, brand: 'SanDisk', unit: 'Pcs', hsnCode: '8523', gstRate: 18, mrp: 12999, purchasePrice: 7200, sellingPrice: 9999, trackingType: 'NONE', reorderLevel: 5, reorderQty: 20 },
    { name: 'Ultra High-Speed HDMI 2.1 Cable 2m 8K', sku: 'ACC-HDMI-2M', barcode: '8901234500103', categoryId: catAccessories._id, brand: 'Belkin', unit: 'Pcs', hsnCode: '8544', gstRate: 18, mrp: 1999, purchasePrice: 550, sellingPrice: 1299, trackingType: 'NONE', reorderLevel: 12, reorderQty: 30 },
    { name: 'Philips Digital Air Fryer 4.1L (1400W)', sku: 'HOME-PHIL-AF4', barcode: '8901234500110', categoryId: catAppliances._id, brand: 'Philips', unit: 'Pcs', hsnCode: '8516', gstRate: 18, mrp: 9995, purchasePrice: 5400, sellingPrice: 7995, trackingType: 'NONE', reorderLevel: 5, reorderQty: 15 },
    { name: 'Prestige Induction Cooktop 2000W PIC 20', sku: 'HOME-PRES-IND', barcode: '8901234500127', categoryId: catAppliances._id, brand: 'Prestige', unit: 'Pcs', hsnCode: '8516', gstRate: 18, mrp: 3895, purchasePrice: 2100, sellingPrice: 2995, trackingType: 'NONE', reorderLevel: 8, reorderQty: 25 },
    { name: 'Havells Stealth Air 1200mm Ceiling Fan', sku: 'HOME-HAV-FAN', barcode: '8901234500134', categoryId: catAppliances._id, brand: 'Havells', unit: 'Pcs', hsnCode: '8414', gstRate: 18, mrp: 3450, purchasePrice: 1950, sellingPrice: 2699, trackingType: 'NONE', reorderLevel: 10, reorderQty: 30 },
    { name: 'Wipro Smart LED Bulb 12W (16M Colors)', sku: 'HOME-WIP-12W', barcode: '8901234500141', categoryId: catAppliances._id, brand: 'Wipro', unit: 'Pcs', hsnCode: '8539', gstRate: 18, mrp: 999, purchasePrice: 320, sellingPrice: 599, trackingType: 'NONE', reorderLevel: 20, reorderQty: 60 },
    { name: 'Organic Darjeeling Long Leaf Tea (100 Bags)', sku: 'FMCG-TEA-DARJ', barcode: '8901234500158', categoryId: catBeverages._id, brand: 'Tata Tea', unit: 'Box', hsnCode: '0902', gstRate: 5, mrp: 499, purchasePrice: 220, sellingPrice: 399, trackingType: 'BATCH', reorderLevel: 25, reorderQty: 80 },
    { name: 'Nescafe Gold Premium Rich Blend Coffee 200g', sku: 'FMCG-NES-GOLD', barcode: '8901234500165', categoryId: catBeverages._id, brand: 'Nestle', unit: 'Pcs', hsnCode: '2101', gstRate: 18, mrp: 850, purchasePrice: 510, sellingPrice: 720, trackingType: 'BATCH', reorderLevel: 15, reorderQty: 50 },
    { name: 'Dettol Germ Protection Handwash 900ml Refill', sku: 'FMCG-DET-900', barcode: '8901234500172', categoryId: catPersonalCare._id, brand: 'Dettol', unit: 'Pcs', hsnCode: '3401', gstRate: 18, mrp: 199, purchasePrice: 110, sellingPrice: 165, trackingType: 'BATCH', reorderLevel: 30, reorderQty: 100 },
    { name: 'Ferrero Rocher Hazelnut Pralines T24 Gift Box', sku: 'FMCG-FER-T24', barcode: '8901234500189', categoryId: catSnacks._id, brand: 'Ferrero', unit: 'Box', hsnCode: '1806', gstRate: 18, mrp: 1195, purchasePrice: 720, sellingPrice: 999, trackingType: 'BATCH', reorderLevel: 12, reorderQty: 40 },
    { name: 'Pringles Sour Cream & Onion Crisps 107g', sku: 'FMCG-PRING-SC', barcode: '8901234500196', categoryId: catSnacks._id, brand: 'Kelloggs', unit: 'Pcs', hsnCode: '1905', gstRate: 12, mrp: 130, purchasePrice: 75, sellingPrice: 110, trackingType: 'BATCH', reorderLevel: 40, reorderQty: 120 },
    { name: 'Classmate Pulse Spiral Bound Notebook A4 (300 pgs)', sku: 'STAT-CLAS-A4', barcode: '8901234500202', categoryId: catStationery._id, brand: 'ITC', unit: 'Pcs', hsnCode: '4820', gstRate: 12, mrp: 180, purchasePrice: 90, sellingPrice: 145, trackingType: 'NONE', reorderLevel: 30, reorderQty: 100 },
    { name: 'Parker Vector Metallic CT Rollerball Pen', sku: 'STAT-PARK-VEC', barcode: '8901234500219', categoryId: catStationery._id, brand: 'Parker', unit: 'Pcs', hsnCode: '9608', gstRate: 18, mrp: 450, purchasePrice: 220, sellingPrice: 350, trackingType: 'NONE', reorderLevel: 10, reorderQty: 30 },
  ];

  const products = [];
  for (const pd of productsData) {
    const p = await InvProduct.create({ tenantId, ...pd });
    products.push(p);
  }
  console.log(`[Seed] ✓ ${products.length} Products`);

  // ─── Suppliers ──────────────────────────────────────────────────
  const suppliersData = [
    { name: 'Samsung India Electronics Ltd', gstin: '07AABCS1429B1Z4', pan: 'AABCS1429B', contactName: 'Rajiv Malhotra', phone: '+91 98110 54321', email: 'orders@samsung-dist.in', address: 'DLF Cyber City, Tower B', city: 'Gurugram', state: 'Haryana', stateCode: '06', pincode: '122002', paymentTerms: 30, creditLimit: 2500000 },
    { name: 'Imagine Tresor Retail Supplies Pvt Ltd', gstin: '27AACCI8834M1Z2', pan: 'AACCI8834M', contactName: 'Sneha Kapur', phone: '+91 98205 99887', email: 'b2b@imaginetresor.com', address: 'Unit 12, Phoenix Palladium', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', pincode: '400013', paymentTerms: 15, creditLimit: 1000000 },
    { name: 'Tata Consumer Products Distribution', gstin: '27AAACT2702H1ZQ', pan: 'AAACT2702H', contactName: 'Arun Iyer', phone: '+91 98211 44556', email: 'fmcg-orders@tataconsumer.com', address: 'Kirloskar Business Park', city: 'Bengaluru', state: 'Karnataka', stateCode: '29', pincode: '560024', paymentTerms: 21, creditLimit: 800000 },
    { name: 'Havells India Commercial Division', gstin: '09AAACH1889L1Z8', pan: 'AAACH1889L', contactName: 'Deepak Saxena', phone: '+91 98711 22334', email: 'b2b@havells.com', address: 'QRG Towers, 2D Expressway', city: 'Noida', state: 'Uttar Pradesh', stateCode: '09', pincode: '201304', paymentTerms: 30, creditLimit: 1200000 },
    { name: 'Ingram Micro India Pvt Ltd', gstin: '27AAACI1607C1Z6', pan: 'AAACI1607C', contactName: 'Manish Chawla', phone: '+91 98330 66778', email: 'enterprise@ingrammicro.in', address: 'Godrej Coliseum, Sion', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', pincode: '400022', paymentTerms: 45, creditLimit: 1800000 },
  ];
  const suppliers = [];
  for (const sd of suppliersData) {
    suppliers.push(await InvSupplier.create({ tenantId, ...sd }));
  }
  console.log(`[Seed] ✓ ${suppliers.length} Suppliers`);

  // ─── Customers ──────────────────────────────────────────────────
  const customersData = [
    { name: 'TechNova IT Solutions Pvt Ltd', gstin: '27AAACT9901R1Z1', pan: 'AAACT9901R', contactName: 'Vikram Sengupta', phone: '+91 98200 11223', email: 'procurement@technova.io', billingAddress: 'Tower 4, Mindspace SEZ, Airoli', city: 'Navi Mumbai', state: 'Maharashtra', stateCode: '27', pincode: '400708', paymentTerms: 30, creditLimit: 1500000 },
    { name: 'GreenLeaf Gourmet Café & Lounge', gstin: '27AABCG4412K1Z9', pan: 'AABCG4412K', contactName: 'Ananya Deshmukh', phone: '+91 98214 77889', email: 'accounts@greenleafcafe.in', billingAddress: 'Shop 4-6, Linking Road, Bandra', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', pincode: '400050', paymentTerms: 15, creditLimit: 300000 },
    { name: 'Rajesh Departmental Store & Wholesale', gstin: '27AABCR7712E1Z3', pan: 'AABCR7712E', contactName: 'Rajesh Agarwal', phone: '+91 98335 12345', email: 'rajeshstore.mumbai@gmail.com', billingAddress: '142 Crawford Market, Fort', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', pincode: '400001', paymentTerms: 21, creditLimit: 600000 },
    { name: 'Walk-in Retail / Counter Cash Sales', gstin: null, contactName: 'Cash Counter', phone: '+91 98000 00000', email: 'pos-cash@store.in', billingAddress: 'Retail Counter POS', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', pincode: '400053', paymentTerms: 0, creditLimit: 0 },
    { name: 'Vikram Mehta Enterprises', gstin: '27AABCV3314Q1Z8', pan: 'AABCV3314Q', contactName: 'Vikram Mehta', phone: '+91 98211 22334', email: 'mehta.enterprises@gmail.com', billingAddress: 'Plot 18, MIDC Central Road', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', pincode: '400093', paymentTerms: 30, creditLimit: 800000 },
    { name: 'Gupta General Trading Co.', gstin: '27AAACG5518P1Z5', pan: 'AAACG5518P', contactName: 'Suresh Gupta', phone: '+91 98333 44556', email: 'guptatraders.bom@gmail.com', billingAddress: '55 Princess Street, Kalbadevi', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', pincode: '400002', paymentTerms: 30, creditLimit: 500000 },
  ];
  const customers = [];
  for (const cd of customersData) {
    customers.push(await InvCustomer.create({ tenantId, ...cd }));
  }
  console.log(`[Seed] ✓ ${customers.length} Customers`);

  // ─── Stock Ledger ────────────────────────────────────────────────
  const stockCfgs = [
    { sku: 'ELEC-OP12-512', qty: 15, wh: whGodown._id },
    { sku: 'ELEC-S24U-256', qty: 8,  wh: whGodown._id },
    { sku: 'ELEC-APP-PRO2', qty: 20, wh: whGodown._id },
    { sku: 'ELEC-BOAT-441', qty: 3,  wh: whCounter._id },  // Low stock
    { sku: 'ELEC-SONY-XM5', qty: 6,  wh: whGodown._id },
    { sku: 'ACC-ANK-65W',   qty: 35, wh: whGodown._id },
    { sku: 'ACC-USBC-2M',   qty: 90, wh: whCounter._id },
    { sku: 'ACC-LOGI-MX3S', qty: 14, wh: whGodown._id },
    { sku: 'ACC-SAND-1TB',  qty: 12, wh: whGodown._id },
    { sku: 'ACC-HDMI-2M',   qty: 45, wh: whCounter._id },
    { sku: 'HOME-PHIL-AF4', qty: 8,  wh: whGodown._id },
    { sku: 'HOME-PRES-IND', qty: 16, wh: whGodown._id },
    { sku: 'HOME-HAV-FAN',  qty: 22, wh: whGodown._id },
    { sku: 'HOME-WIP-12W',  qty: 55, wh: whCounter._id },
    { sku: 'FMCG-TEA-DARJ', qty: 60, wh: whGodown._id, batch: 'BATCH-26TEA-01', exp: new Date(Date.now() + 180 * 86400000) },
    { sku: 'FMCG-NES-GOLD', qty: 40, wh: whGodown._id, batch: 'BATCH-26NES-02', exp: new Date(Date.now() + 240 * 86400000) },
    { sku: 'FMCG-DET-900',  qty: 75, wh: whGodown._id, batch: 'BATCH-26DET-03', exp: new Date(Date.now() + 365 * 86400000) },
    { sku: 'FMCG-FER-T24',  qty: 28, wh: whCounter._id, batch: 'BATCH-26FER-04', exp: new Date(Date.now() + 90 * 86400000) },
    { sku: 'FMCG-PRING-SC', qty: 85, wh: whCounter._id, batch: 'BATCH-26PRG-05', exp: new Date(Date.now() + 120 * 86400000) },
    { sku: 'STAT-CLAS-A4',  qty: 90, wh: whCounter._id },
    { sku: 'STAT-PARK-VEC', qty: 2,  wh: whCounter._id }, // Low stock
  ];
  for (const st of stockCfgs) {
    const prod = products.find(p => p.sku === st.sku);
    if (!prod) continue;
    await InvStockLedger.create({
      tenantId, productId: prod._id, warehouseId: st.wh, txnType: 'OPENING',
      date: new Date(Date.now() - 45 * 86400000),
      batchNo: st.batch || null, expiryDate: st.exp || null,
      qty: st.qty, unitCost: prod.purchasePrice, totalCost: st.qty * prod.purchasePrice,
      remarks: 'Initial Store Inventory Stock-In', createdBy: userId,
    });
  }
  console.log('[Seed] ✓ Stock ledger');

  // ─── Bank Accounts ───────────────────────────────────────────────
  const hdfcBank = await BankAccount.create({
    tenantId, bankName: 'HDFC Bank', accountName: 'HDFC Main Operational A/C',
    accountNumber: '50200099881122', ifscCode: 'HDFC0000123',
    branchName: 'Andheri East, Mumbai', accountType: 'CURRENT',
    upiId: 'store@hdfcbank', openingBalance: 200000, isDefault: true, isActive: true, createdBy: userId,
  });
  const iciciBank = await BankAccount.create({
    tenantId, bankName: 'ICICI Bank', accountName: 'ICICI Vendor Payouts A/C',
    accountNumber: '91900088776655', ifscCode: 'ICIC0001040',
    branchName: 'Bandra, Mumbai', accountType: 'CURRENT',
    upiId: 'store@icici', openingBalance: 100000, isDefault: false, isActive: true, createdBy: userId,
  });
  console.log('[Seed] ✓ Bank accounts');

  // ─── Purchase Bills ──────────────────────────────────────────────
  const D = (d) => new Date(Date.now() + d * 86400000);
  const bills = [
    { voucherNo: 'BILL-001', sup: suppliers[0], amt: 540000, sub: 457627, tax: 82373, settled: 540000, status: 'PAID', date: D(-40), due: D(-10), notes: '10x OnePlus 12 5G', items: [{ productId: products[0]._id, productName: products[0].name, sku: products[0].sku, hsn: '8517', qty: 10, unit: 'Pcs', unitPrice: 54000, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 457627, cgstAmount: 41186, sgstAmount: 41187, amount: 540000 }] },
    { voucherNo: 'BILL-002', sup: suppliers[1], amt: 175000, sub: 148305, tax: 26695, settled: 175000, status: 'PAID', date: D(-35), due: D(-20), notes: '10x AirPods Pro 2', items: [{ productId: products[2]._id, productName: products[2].name, sku: products[2].sku, hsn: '8518', qty: 10, unit: 'Pcs', unitPrice: 17500, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 148305, cgstAmount: 13348, sgstAmount: 13347, amount: 175000 }] },
    { voucherNo: 'BILL-003', sup: suppliers[2], amt: 45300, sub: 39830, tax: 5470, settled: 45300, status: 'PAID', date: D(-30), due: D(-9), notes: 'Tea & Coffee supply', items: [{ productId: products[14]._id, productName: products[14].name, sku: products[14].sku, hsn: '0902', qty: 60, unit: 'Box', unitPrice: 220, taxPct: 5, cgstRate: 2.5, sgstRate: 2.5, taxableAmount: 12571, cgstAmount: 314, sgstAmount: 315, amount: 13200 }, { productId: products[15]._id, productName: products[15].name, sku: products[15].sku, hsn: '2101', qty: 40, unit: 'Pcs', unitPrice: 510, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 17288, cgstAmount: 1559, sgstAmount: 1553, amount: 20400 }, { productId: products[16]._id, productName: products[16].name, sku: products[16].sku, hsn: '3401', qty: 100, unit: 'Pcs', unitPrice: 110, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 9322, cgstAmount: 839, sgstAmount: 839, amount: 11000 }] },
    { voucherNo: 'BILL-004', sup: suppliers[3], amt: 68000, sub: 57627, tax: 10373, settled: 68000, status: 'PAID', date: D(-25), due: D(5), notes: 'Havells fans & lighting', items: [{ productId: products[12]._id, productName: products[12].name, sku: products[12].sku, hsn: '8414', qty: 20, unit: 'Pcs', unitPrice: 1950, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 33051, cgstAmount: 2975, sgstAmount: 2974, amount: 39000 }, { productId: products[13]._id, productName: products[13].name, sku: products[13].sku, hsn: '8539', qty: 60, unit: 'Pcs', unitPrice: 320, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 16271, cgstAmount: 1464, sgstAmount: 1465, amount: 19200 }] },
    { voucherNo: 'BILL-005', sup: suppliers[4], amt: 95600, sub: 81017, tax: 14583, settled: 95600, status: 'PAID', date: D(-20), due: D(25), notes: 'Logitech mice & SSDs', items: [{ productId: products[7]._id, productName: products[7].name, sku: products[7].sku, hsn: '8471', qty: 8, unit: 'Pcs', unitPrice: 6800, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 46102, cgstAmount: 4149, sgstAmount: 4149, amount: 54400 }, { productId: products[8]._id, productName: products[8].name, sku: products[8].sku, hsn: '8523', qty: 5, unit: 'Pcs', unitPrice: 7200, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 30508, cgstAmount: 2746, sgstAmount: 2746, amount: 36000 }] },
    { voucherNo: 'BILL-006', sup: suppliers[0], amt: 204000, sub: 172882, tax: 31118, settled: 204000, status: 'PAID', date: D(-15), due: D(15), notes: '2x Galaxy S24 Ultra', items: [{ productId: products[1]._id, productName: products[1].name, sku: products[1].sku, hsn: '8517', qty: 2, unit: 'Pcs', unitPrice: 102000, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 172882, cgstAmount: 15559, sgstAmount: 15559, amount: 204000 }] },
    { voucherNo: 'BILL-007', sup: suppliers[1], amt: 48000, sub: 40678, tax: 7322, settled: 28000, status: 'PARTIALLY_PAID', date: D(-6), due: D(9), notes: '2x Sony XM5 Headphones', items: [{ productId: products[4]._id, productName: products[4].name, sku: products[4].sku, hsn: '8518', qty: 2, unit: 'Pcs', unitPrice: 24000, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 40678, cgstAmount: 3661, sgstAmount: 3661, amount: 48000 }] },
    { voucherNo: 'BILL-008', sup: suppliers[4], amt: 45000, sub: 38136, tax: 6864, settled: 0, status: 'UNPAID', date: D(-4), due: D(41), notes: 'Anker chargers & cables', items: [{ productId: products[5]._id, productName: products[5].name, sku: products[5].sku, hsn: '8504', qty: 15, unit: 'Pcs', unitPrice: 1400, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 17797, cgstAmount: 1602, sgstAmount: 1601, amount: 21000 }, { productId: products[6]._id, productName: products[6].name, sku: products[6].sku, hsn: '8544', qty: 80, unit: 'Pcs', unitPrice: 180, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 12203, cgstAmount: 1099, sgstAmount: 1098, amount: 14400 }] },
    { voucherNo: 'BILL-009', sup: suppliers[3], amt: 50000, sub: 42373, tax: 7627, settled: 0, status: 'UNPAID', date: D(-2), due: D(28), notes: 'Prestige cooktops & Wipro bulbs', items: [{ productId: products[11]._id, productName: products[11].name, sku: products[11].sku, hsn: '8516', qty: 8, unit: 'Pcs', unitPrice: 2100, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 14237, cgstAmount: 1281, sgstAmount: 1282, amount: 16800 }, { productId: products[13]._id, productName: products[13].name, sku: products[13].sku, hsn: '8539', qty: 55, unit: 'Pcs', unitPrice: 320, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 14898, cgstAmount: 1341, sgstAmount: 1341, amount: 17600 }] },
  ];

  const createdBills = [];
  for (const b of bills) {
    const doc = await InvPaymentTransaction.create({
      tenantId, voucherNo: b.voucherNo, txnType: 'BILL', partyType: 'SUPPLIER',
      partyId: b.sup._id, partyModel: 'InvSupplier', partyName: b.sup.name,
      partyGstin: b.sup.gstin || '', partyPhone: b.sup.phone || '',
      amount: b.amt, subtotal: b.sub, taxTotal: b.tax, cgstTotal: b.tax/2, sgstTotal: b.tax/2,
      items: b.items || [], paymentMode: 'CREDIT',
      paymentDate: b.date, date: b.date, dueDate: b.due,
      settledAmount: b.settled, paymentStatus: b.status, notes: b.notes, createdBy: userId,
    });
    createdBills.push(doc);
  }

  // Payment out for settled bills
  const payModes = ['NEFT_RTGS', 'UPI', 'NEFT_RTGS', 'CHEQUE', 'NEFT_RTGS', 'NEFT_RTGS'];
  const payBanks = [hdfcBank._id, iciciBank._id, hdfcBank._id, hdfcBank._id, iciciBank._id, hdfcBank._id];
  for (let i = 0; i < 6; i++) {
    await InvPaymentTransaction.create({
      tenantId, voucherNo: `PAY-00${i+1}`, txnType: 'PAYMENT_OUT', partyType: 'SUPPLIER',
      partyId: bills[i].sup._id, partyModel: 'InvSupplier', partyName: bills[i].sup.name,
      amount: bills[i].settled, paymentMode: payModes[i],
      paymentDate: new Date(bills[i].date.getTime() + 2 * 86400000),
      date: new Date(bills[i].date.getTime() + 2 * 86400000),
      bankAccountId: payBanks[i], createdBy: userId,
      allocatedBills: [{ billId: createdBills[i]._id, voucherNo: createdBills[i].voucherNo, allocatedAmount: bills[i].settled, remainingBillBalance: 0 }],
    });
  }
  console.log(`[Seed] ✓ ${bills.length} Purchase Bills + payment vouchers`);

  // ─── Sales Invoices ──────────────────────────────────────────────
  const invs = [
    { voucherNo: 'INV-001', cust: customers[0], amt: 324995, sub: 275420, tax: 49575, settled: 324995, status: 'PAID', date: D(-42), due: D(-12), notes: '5x OnePlus 12 5G corporate', items: [{ productId: products[0]._id, productName: products[0].name, sku: products[0].sku, hsn: '8517', qty: 5, unit: 'Pcs', unitPrice: 64999, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 275420, cgstAmount: 24788, sgstAmount: 24787, amount: 324995 }] },
    { voucherNo: 'INV-002', cust: customers[1], amt: 34900, sub: 31286, tax: 3614, settled: 34900, status: 'PAID', date: D(-36), due: D(-21), notes: 'Tea & coffee supply', items: [{ productId: products[14]._id, productName: products[14].name, sku: products[14].sku, hsn: '0902', qty: 25, unit: 'Box', unitPrice: 399, taxPct: 5, cgstRate: 2.5, sgstRate: 2.5, taxableAmount: 9500, cgstAmount: 238, sgstAmount: 237, amount: 9975 }, { productId: products[15]._id, productName: products[15].name, sku: products[15].sku, hsn: '2101', qty: 25, unit: 'Pcs', unitPrice: 720, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 15254, cgstAmount: 1373, sgstAmount: 1373, amount: 18000 }] },
    { voucherNo: 'INV-003', cust: customers[3], amt: 140460, sub: 119542, tax: 20918, settled: 140460, status: 'PAID', date: D(-30), due: D(-30), notes: 'Retail counter sales cash', items: [{ productId: products[10]._id, productName: products[10].name, sku: products[10].sku, hsn: '8516', qty: 5, unit: 'Pcs', unitPrice: 7995, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 33877, cgstAmount: 3049, sgstAmount: 3049, amount: 39975 }, { productId: products[12]._id, productName: products[12].name, sku: products[12].sku, hsn: '8414', qty: 10, unit: 'Pcs', unitPrice: 2699, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 22873, cgstAmount: 2059, sgstAmount: 2058, amount: 26990 }, { productId: products[13]._id, productName: products[13].name, sku: products[13].sku, hsn: '8539', qty: 80, unit: 'Pcs', unitPrice: 599, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 40610, cgstAmount: 3655, sgstAmount: 3655, amount: 47920 }] },
    { voucherNo: 'INV-004', cust: customers[4], amt: 119999, sub: 101694, tax: 18305, settled: 119999, status: 'PAID', date: D(-20), due: D(10), notes: '1x Samsung Galaxy S24 Ultra', items: [{ productId: products[1]._id, productName: products[1].name, sku: products[1].sku, hsn: '8517', qty: 1, unit: 'Pcs', unitPrice: 119999, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 101694, cgstAmount: 9153, sgstAmount: 9152, amount: 119999 }] },
    { voucherNo: 'INV-005', cust: customers[3], amt: 139998, sub: 118643, tax: 21355, settled: 139998, status: 'PAID', date: D(-16), due: D(-16), notes: 'Counter electronics cash', items: [{ productId: products[3]._id, productName: products[3].name, sku: products[3].sku, hsn: '8518', qty: 20, unit: 'Pcs', unitPrice: 1499, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 25407, cgstAmount: 2287, sgstAmount: 2286, amount: 29980 }, { productId: products[5]._id, productName: products[5].name, sku: products[5].sku, hsn: '8504', qty: 18, unit: 'Pcs', unitPrice: 2499, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 38119, cgstAmount: 3431, sgstAmount: 3430, amount: 44982 }] },
    { voucherNo: 'INV-006', cust: customers[0], amt: 224900, sub: 190593, tax: 34307, settled: 224900, status: 'PAID', date: D(-12), due: D(18), notes: '10x Apple AirPods Pro 2', items: [{ productId: products[2]._id, productName: products[2].name, sku: products[2].sku, hsn: '8518', qty: 10, unit: 'Pcs', unitPrice: 22490, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 190593, cgstAmount: 17153, sgstAmount: 17154, amount: 224900 }] },
    { voucherNo: 'INV-007', cust: customers[2], amt: 120070, sub: 103644, tax: 16426, settled: 70000, status: 'PARTIALLY_PAID', date: D(-5), due: D(16), notes: 'Festive confectionery bulk', items: [{ productId: products[17]._id, productName: products[17].name, sku: products[17].sku, hsn: '1806', qty: 60, unit: 'Box', unitPrice: 999, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 50763, cgstAmount: 4568, sgstAmount: 4569, amount: 59940 }, { productId: products[18]._id, productName: products[18].name, sku: products[18].sku, hsn: '1905', qty: 490, unit: 'Pcs', unitPrice: 110, taxPct: 12, cgstRate: 6, sgstRate: 6, taxableAmount: 48125, cgstAmount: 2888, sgstAmount: 2887, amount: 53900 }] },
    { voucherNo: 'INV-008', cust: customers[4], amt: 89950, sub: 76229, tax: 13721, settled: 39950, status: 'PARTIALLY_PAID', date: D(-3), due: D(27), notes: '10x Logitech MX Master 3S', items: [{ productId: products[7]._id, productName: products[7].name, sku: products[7].sku, hsn: '8471', qty: 10, unit: 'Pcs', unitPrice: 8995, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 76229, cgstAmount: 6861, sgstAmount: 6860, amount: 89950 }] },
    { voucherNo: 'INV-009', cust: customers[5], amt: 144890, sub: 125025, tax: 19865, settled: 0, status: 'UNPAID', date: D(-62), due: D(-32), notes: 'Audio & USB wholesale (OVERDUE)', items: [{ productId: products[4]._id, productName: products[4].name, sku: products[4].sku, hsn: '8518', qty: 3, unit: 'Pcs', unitPrice: 29990, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 76254, cgstAmount: 6863, sgstAmount: 6863, amount: 89970 }, { productId: products[6]._id, productName: products[6].name, sku: products[6].sku, hsn: '8544', qty: 100, unit: 'Pcs', unitPrice: 499, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 42373, cgstAmount: 3814, sgstAmount: 3813, amount: 49900 }] },
    { voucherNo: 'INV-010', cust: customers[0], amt: 74960, sub: 63525, tax: 11435, settled: 0, status: 'UNPAID', date: D(-2), due: D(28), notes: 'SanDisk SSDs & GaN chargers', items: [{ productId: products[8]._id, productName: products[8].name, sku: products[8].sku, hsn: '8523', qty: 5, unit: 'Pcs', unitPrice: 9999, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 42368, cgstAmount: 3813, sgstAmount: 3814, amount: 49995 }, { productId: products[5]._id, productName: products[5].name, sku: products[5].sku, hsn: '8504', qty: 10, unit: 'Pcs', unitPrice: 2499, taxPct: 18, cgstRate: 9, sgstRate: 9, taxableAmount: 21178, cgstAmount: 1906, sgstAmount: 1906, amount: 24990 }] },
  ];

  const createdInvs = [];
  for (const inv of invs) {
    const doc = await InvPaymentTransaction.create({
      tenantId, voucherNo: inv.voucherNo, txnType: 'INVOICE', partyType: 'CUSTOMER',
      partyId: inv.cust._id, partyModel: 'InvCustomer', partyName: inv.cust.name,
      partyGstin: inv.cust.gstin || '', partyPhone: inv.cust.phone || '', partyEmail: inv.cust.email || '',
      amount: inv.amt, subtotal: inv.sub, taxTotal: inv.tax, cgstTotal: inv.tax/2, sgstTotal: inv.tax/2,
      items: inv.items || [], paymentMode: 'CREDIT',
      paymentDate: inv.date, date: inv.date, dueDate: inv.due,
      settledAmount: inv.settled, paymentStatus: inv.status, notes: inv.notes, createdBy: userId,
    });
    createdInvs.push(doc);
  }

  // Payment in receipts for settled invoices
  const recModes = ['NEFT_RTGS', 'UPI', 'CASH', 'CARD', 'CASH', 'NEFT_RTGS'];
  const recBanks = [hdfcBank._id, hdfcBank._id, null, hdfcBank._id, null, iciciBank._id];
  for (let i = 0; i < 6; i++) {
    await InvPaymentTransaction.create({
      tenantId, voucherNo: `REC-00${i+1}`, txnType: 'PAYMENT_IN', partyType: 'CUSTOMER',
      partyId: invs[i].cust._id, partyModel: 'InvCustomer', partyName: invs[i].cust.name,
      amount: invs[i].settled, paymentMode: recModes[i],
      paymentDate: new Date(invs[i].date.getTime() + 2 * 86400000),
      date: new Date(invs[i].date.getTime() + 2 * 86400000),
      bankAccountId: recBanks[i], createdBy: userId,
      allocatedBills: [{ billId: createdInvs[i]._id, voucherNo: createdInvs[i].voucherNo, allocatedAmount: invs[i].settled, remainingBillBalance: Math.max(0, invs[i].amt - invs[i].settled) }],
    });
  }
  console.log(`[Seed] ✓ ${invs.length} Sales Invoices + collection receipts`);

  await mongoose.disconnect();
  console.log('\n=== DONE ===');
  console.log(`Tenant:    ${tenantId}`);
  console.log(`Products:  ${products.length}`);
  console.log(`Suppliers: ${suppliers.length}`);
  console.log(`Customers: ${customers.length}`);
  console.log(`Bills:     ${bills.length}`);
  console.log(`Invoices:  ${invs.length}`);
  console.log('\nLogin with any of these to see your data:');
  console.log(` → ${TARGET_EMAIL}`);
  process.exit(0);
}

seedTenant().catch(e => { console.error('[Error]', e.message); process.exit(1); });
