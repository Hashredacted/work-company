'use strict';

/**
 * Seed Script — Run with: npm run seed
 * Complete, realistic simulation for a Multi-Tenant SaaS Retail Store:
 *   - SaaS Pricing Plans & System Roles
 *   - Flagship Retail Company: "Apex Retail & Supermart Ltd" + secondary tenants
 *   - Category Hierarchy (Electronics, FMCG, Home, Stationery)
 *   - 20+ Realistic Retail Products (Barcodes, HSN, GST, Margins, Batch/Serial tracking)
 *   - Warehouses (Central Godown & Retail Counter)
 *   - Verified B2B Suppliers & Corporate/Retail Customers
 *   - Stock Movements & Ledger History
 *   - Purchase Bills, Sales Invoices, and Payment Knockoff Vouchers
 *   - Positive Cash & Bank Balances
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const mongoose = require('mongoose');

// Models
const User = require('../models/User');
const Role = require('../models/Role');
const Tenant = require('../models/Tenant');
const Plan = require('../models/Plan');

const Warehouse   = require('../models/inv/Warehouse');
const InvCategory = require('../models/inv/Category');
const InvProduct  = require('../models/inv/Product');
const InvSupplier = require('../models/inv/Supplier');
const InvCustomer = require('../models/inv/Customer');
const InvStockLedger = require('../models/inv/StockLedger');
const InvPaymentTransaction = require('../models/inv/PaymentTransaction');
const InvPurchaseOrder = require('../models/inv/PurchaseOrder');
const InvSalesOrder = require('../models/inv/SalesOrder');
const BankAccount = require('../models/inv/BankAccount');

const SUPER_ADMIN_PERMISSIONS = [
  'company:read', 'company:create', 'company:update', 'company:delete',
  'user:read', 'user:create', 'user:update', 'user:delete',
  'role:read', 'role:create', 'role:update', 'role:delete',
  'billing:read', 'billing:manage',
  'subscription:read', 'subscription:manage',
  'audit:read',
  'inventory:read', 'inventory:manage', 'inventory:orders', 'inventory:approve', 'inventory:reports', 'inventory:admin',
];

const COMPANY_ADMIN_PERMISSIONS = [
  'company:read', 'company:update',
  'user:read', 'user:create', 'user:update', 'user:delete',
  'role:read', 'role:create', 'role:update', 'role:delete',
  'billing:read', 'subscription:read',
  'inventory:read', 'inventory:manage', 'inventory:orders', 'inventory:approve', 'inventory:reports', 'inventory:admin',
];

const STORE_MANAGER_PERMISSIONS = [
  'company:read',
  'user:read',
  'role:read',
  'inventory:read', 'inventory:manage', 'inventory:orders', 'inventory:reports',
];

const CASHIER_PERMISSIONS = [
  'company:read',
  'inventory:read', 'inventory:manage',
];

const PLANS = [
  {
    name: 'free', displayName: 'Free', description: 'Perfect for small teams getting started.', sortOrder: 0, isFree: true,
    price: { monthly: 0, yearly: 0 },
    limits: { maxUsers: 3, maxStorage: 1, apiAccess: false, auditLogs: false, customRoles: false, prioritySupport: false },
    features: ['Up to 3 users', '1 GB storage', 'Basic company profile', 'Standard roles'],
  },
  {
    name: 'starter', displayName: 'Starter', description: 'For growing teams needing more control.', sortOrder: 1,
    price: { monthly: 29, yearly: 290 },
    limits: { maxUsers: 10, maxStorage: 10, apiAccess: false, auditLogs: true, customRoles: true, prioritySupport: false },
    features: ['Up to 10 users', '10 GB storage', 'Custom roles', 'Audit logs', 'Basic billing'],
  },
  {
    name: 'pro', displayName: 'Pro', description: 'Advanced features for scaling organizations.', sortOrder: 2,
    price: { monthly: 79, yearly: 790 },
    limits: { maxUsers: 50, maxStorage: 50, apiAccess: true, auditLogs: true, customRoles: true, prioritySupport: false },
    features: ['Up to 50 users', '50 GB storage', 'API access', 'Advanced audit logs', 'All custom roles', 'Billing management'],
  },
  {
    name: 'enterprise', displayName: 'Enterprise', description: 'Unlimited scale with priority support.', sortOrder: 3,
    price: { monthly: 199, yearly: 1990 },
    limits: { maxUsers: -1, maxStorage: 500, apiAccess: true, auditLogs: true, customRoles: true, prioritySupport: true },
    features: ['Unlimited users', '500 GB storage', 'Priority support', 'SSO (coming soon)', 'SLA guarantee', 'Dedicated account manager'],
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('─────────────────────────────────────────────────────────────');
  console.log('[Seed] Connected to MongoDB:', mongoose.connection.name);
  console.log('─────────────────────────────────────────────────────────────');

  // 0. Clean ONLY demo seed data (preserve all user-registered companies and accounts)
  console.log('[Seed] Refreshing demo store data (preserving user-registered accounts)...');
  const demoEmails = [
    'admin@platform.com',
    'admin@apexretail.in',
    'sarah@apexretail.in',
    'priya@apexretail.in',
    'rahul@apexretail.in',
    'admin@nexus.io',
    'admin@acme.com',
    'test@example.com'
  ];
  const demoTenantNames = ['Apex Retail & Supermart Ltd', 'Nexus Digital Labs', 'Acme Corporation'];
  
  const existingDemoTenants = await Tenant.find({ name: { $in: demoTenantNames } }).select('_id');
  const demoTenantIds = existingDemoTenants.map(t => t._id);

  await Promise.all([
    User.deleteMany({ $or: [{ email: { $in: demoEmails } }, { tenantId: { $in: demoTenantIds } }] }),
    Tenant.deleteMany({ _id: { $in: demoTenantIds } }),
    InvPaymentTransaction.deleteMany({ tenantId: { $in: demoTenantIds } }),
    InvStockLedger.deleteMany({ tenantId: { $in: demoTenantIds } }),
    InvPurchaseOrder.deleteMany({ tenantId: { $in: demoTenantIds } }),
    InvSalesOrder.deleteMany({ tenantId: { $in: demoTenantIds } }),
    InvProduct.deleteMany({ tenantId: { $in: demoTenantIds } }),
    InvCategory.deleteMany({ tenantId: { $in: demoTenantIds } }),
    InvSupplier.deleteMany({ tenantId: { $in: demoTenantIds } }),
    InvCustomer.deleteMany({ tenantId: { $in: demoTenantIds } }),
    Warehouse.deleteMany({ tenantId: { $in: demoTenantIds } }),
  ]);

  // 1. Seed Plans
  for (const planData of PLANS) {
    await Plan.findOneAndUpdate({ name: planData.name }, planData, { upsert: true, returnDocument: 'after' });
  }
  console.log('[Seed] ✓ SaaS Plans synchronized');

  // 2. Seed System Roles
  let superAdminRole = await Role.findOneAndUpdate(
    { name: 'super_admin', isSystemRole: true },
    { tenantId: null, name: 'super_admin', permissions: SUPER_ADMIN_PERMISSIONS, isSystemRole: true },
    { upsert: true, returnDocument: 'after' }
  );

  let companyAdminRole = await Role.findOneAndUpdate(
    { name: 'company_admin', isSystemRole: true },
    { tenantId: null, name: 'company_admin', permissions: COMPANY_ADMIN_PERMISSIONS, isSystemRole: true },
    { upsert: true, returnDocument: 'after' }
  );

  let storeManagerRole = await Role.findOneAndUpdate(
    { name: 'manager', isSystemRole: true },
    { tenantId: null, name: 'manager', permissions: STORE_MANAGER_PERMISSIONS, isSystemRole: true },
    { upsert: true, returnDocument: 'after' }
  );

  let cashierRole = await Role.findOneAndUpdate(
    { name: 'cashier', isSystemRole: true },
    { tenantId: null, name: 'cashier', permissions: CASHIER_PERMISSIONS, isSystemRole: true },
    { upsert: true, returnDocument: 'after' }
  );
  console.log('[Seed] ✓ System Roles created');

  // 3. Super Admin User
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@platform.com';
  let superAdminUser = await User.create({
    tenantId: null,
    name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
    email: superAdminEmail,
    password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@1234',
    roleId: superAdminRole._id,
    isActive: true,
  });
  console.log('[Seed] ✓ Super Admin user ready: admin@platform.com');

  // 4. Primary Flagship Retail Tenant: "Apex Retail & Supermart Ltd"
  let flagshipTenant = await Tenant.create({
    name: 'Apex Retail & Supermart Ltd',
    email: 'contact@apexretail.in',
    phone: '+91 98201 23456',
    address: 'Plot 45, Commercial Complex, Andheri East',
    city: 'Mumbai',
    state: 'Maharashtra',
    gst: '27AABCA1234F1Z5',
    license: 'REG-APEX-2026',
    status: 'ACTIVE',
    trialStartedAt: new Date(Date.now() - 60 * 86400000),
    trialEndsAt: new Date(Date.now() + 300 * 86400000),
  });

  // Secondary Tenant: "Nexus Digital Labs"
  let nexusTenant = await Tenant.create({
    name: 'Nexus Digital Labs',
    email: 'contact@nexus.com',
    phone: '+91 91234 56789',
    address: '42 Cyber City, Sector 5, Gurugram',
    city: 'Gurugram',
    state: 'Haryana',
    gst: '07AAACN0123E1Z4',
    license: 'REG-NEXUS-2026',
    status: 'ACTIVE',
  });

  // 5. Company Users for Apex Retail
  const usersToSeed = [
    { email: 'admin@apexretail.in', name: 'Rohan Sharma (Managing Director)', password: 'Password@123', roleId: companyAdminRole._id, tenantId: flagshipTenant._id },
    { email: 'admin@acme.com', name: 'Sarah Connor (Store Admin)', password: 'Password@123', roleId: companyAdminRole._id, tenantId: flagshipTenant._id },
    { email: 'test@example.com', name: 'Test Store Manager', password: 'Password@123', roleId: storeManagerRole._id, tenantId: flagshipTenant._id },
    { email: 'cashier@apexretail.in', name: 'Pooja Verma (Billing Desk)', password: 'Password@123', roleId: cashierRole._id, tenantId: flagshipTenant._id },
  ];

  let companyAdminUser = null;
  for (const u of usersToSeed) {
    const created = await User.create({ ...u, isActive: true });
    if (u.email === 'admin@apexretail.in') companyAdminUser = created;
  }
  console.log('[Seed] ✓ Company staff accounts created');

  const tenantId = flagshipTenant._id;
  const userId = companyAdminUser._id;

  // 6. Warehouses
  const whGodown = await Warehouse.create({
    tenantId,
    name: 'Main Godown & Central Hub',
    code: 'WH-MUM-01',
    type: 'OWNED',
    city: 'Mumbai',
    state: 'Maharashtra',
    stateCode: '27',
    pincode: '400001',
    isDefault: true,
  });

  const whRetailCounter = await Warehouse.create({
    tenantId,
    name: 'Retail Storefront Counter',
    code: 'WH-MUM-02',
    type: 'OWNED',
    city: 'Mumbai',
    state: 'Maharashtra',
    stateCode: '27',
    pincode: '400053',
    isDefault: false,
  });
  console.log('[Seed] ✓ Warehouses created');

  // 7. Category Tree
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
  console.log('[Seed] ✓ Categories hierarchy seeded');

  // 8. 20 Realistic Products
  const productsData = [
    // Electronics - Smartphones & Audio
    { name: 'OnePlus 12 5G (16GB/512GB Flowy Emerald)', sku: 'ELEC-OP12-512', barcode: '8901234500011', categoryId: catSmartphones._id, brand: 'OnePlus', unit: 'Pcs', hsnCode: '8517', gstRate: 18, mrp: 69999, purchasePrice: 54000, sellingPrice: 64999, trackingType: 'SERIAL', reorderLevel: 5, reorderQty: 20 },
    { name: 'Samsung Galaxy S24 Ultra (256GB Titanium)', sku: 'ELEC-S24U-256', barcode: '8901234500028', categoryId: catSmartphones._id, brand: 'Samsung', unit: 'Pcs', hsnCode: '8517', gstRate: 18, mrp: 129999, purchasePrice: 102000, sellingPrice: 119999, trackingType: 'SERIAL', reorderLevel: 3, reorderQty: 10 },
    { name: 'Apple AirPods Pro (2nd Gen with USB-C)', sku: 'ELEC-APP-PRO2', barcode: '8901234500035', categoryId: catAudio._id, brand: 'Apple', unit: 'Pcs', hsnCode: '8518', gstRate: 18, mrp: 24900, purchasePrice: 17500, sellingPrice: 22490, trackingType: 'SERIAL', reorderLevel: 5, reorderQty: 15 },
    { name: 'boAt Airdopes 441 True Wireless Earbuds', sku: 'ELEC-BOAT-441', barcode: '8901234500042', categoryId: catAudio._id, brand: 'boAt', unit: 'Pcs', hsnCode: '8518', gstRate: 18, mrp: 2999, purchasePrice: 850, sellingPrice: 1499, trackingType: 'NONE', reorderLevel: 10, reorderQty: 50 },
    { name: 'Sony WH-1000XM5 Wireless ANC Headphones', sku: 'ELEC-SONY-XM5', barcode: '8901234500059', categoryId: catAudio._id, brand: 'Sony', unit: 'Pcs', hsnCode: '8518', gstRate: 18, mrp: 34990, purchasePrice: 24000, sellingPrice: 29990, trackingType: 'SERIAL', reorderLevel: 4, reorderQty: 10 },

    // Electronics - Accessories
    { name: 'Anker 65W GaN Fast Wall Charger', sku: 'ACC-ANK-65W', barcode: '8901234500066', categoryId: catAccessories._id, brand: 'Anker', unit: 'Pcs', hsnCode: '8504', gstRate: 18, mrp: 3499, purchasePrice: 1400, sellingPrice: 2499, trackingType: 'NONE', reorderLevel: 15, reorderQty: 40 },
    { name: 'Braided Type-C to Type-C 100W Cable 2m', sku: 'ACC-USBC-2M', barcode: '8901234500073', categoryId: catAccessories._id, brand: 'Portronics', unit: 'Pcs', hsnCode: '8544', gstRate: 18, mrp: 799, purchasePrice: 180, sellingPrice: 499, trackingType: 'NONE', reorderLevel: 25, reorderQty: 100 },
    { name: 'Logitech MX Master 3S Wireless Mouse', sku: 'ACC-LOGI-MX3S', barcode: '8901234500080', categoryId: catAccessories._id, brand: 'Logitech', unit: 'Pcs', hsnCode: '8471', gstRate: 18, mrp: 10995, purchasePrice: 6800, sellingPrice: 8995, trackingType: 'NONE', reorderLevel: 6, reorderQty: 20 },
    { name: 'SanDisk Extreme 1TB Portable External SSD', sku: 'ACC-SAND-1TB', barcode: '8901234500097', categoryId: catAccessories._id, brand: 'SanDisk', unit: 'Pcs', hsnCode: '8523', gstRate: 18, mrp: 12999, purchasePrice: 7200, sellingPrice: 9999, trackingType: 'NONE', reorderLevel: 5, reorderQty: 20 },
    { name: 'Ultra High-Speed HDMI 2.1 Cable 2m 8K', sku: 'ACC-HDMI-2M', barcode: '8901234500103', categoryId: catAccessories._id, brand: 'Belkin', unit: 'Pcs', hsnCode: '8544', gstRate: 18, mrp: 1999, purchasePrice: 550, sellingPrice: 1299, trackingType: 'NONE', reorderLevel: 12, reorderQty: 30 },

    // Home Appliances
    { name: 'Philips Digital Air Fryer 4.1L (1400W)', sku: 'HOME-PHIL-AF4', barcode: '8901234500110', categoryId: catAppliances._id, brand: 'Philips', unit: 'Pcs', hsnCode: '8516', gstRate: 18, mrp: 9995, purchasePrice: 5400, sellingPrice: 7995, trackingType: 'NONE', reorderLevel: 5, reorderQty: 15 },
    { name: 'Prestige Induction Cooktop 2000W PIC 20', sku: 'HOME-PRES-IND', barcode: '8901234500127', categoryId: catAppliances._id, brand: 'Prestige', unit: 'Pcs', hsnCode: '8516', gstRate: 18, mrp: 3895, purchasePrice: 2100, sellingPrice: 2995, trackingType: 'NONE', reorderLevel: 8, reorderQty: 25 },
    { name: 'Havells Stealth Air 1200mm Ceiling Fan', sku: 'HOME-HAV-FAN', barcode: '8901234500134', categoryId: catAppliances._id, brand: 'Havells', unit: 'Pcs', hsnCode: '8414', gstRate: 18, mrp: 3450, purchasePrice: 1950, sellingPrice: 2699, trackingType: 'NONE', reorderLevel: 10, reorderQty: 30 },
    { name: 'Wipro Smart LED Bulb 12W (16M Colors)', sku: 'HOME-WIP-12W', barcode: '8901234500141', categoryId: catAppliances._id, brand: 'Wipro', unit: 'Pcs', hsnCode: '8539', gstRate: 18, mrp: 999, purchasePrice: 320, sellingPrice: 599, trackingType: 'NONE', reorderLevel: 20, reorderQty: 60 },

    // FMCG & Groceries
    { name: 'Organic Darjeeling Long Leaf Tea (100 Bags)', sku: 'FMCG-TEA-DARJ', barcode: '8901234500158', categoryId: catBeverages._id, brand: 'Tata Tea', unit: 'Box', hsnCode: '0902', gstRate: 5, mrp: 499, purchasePrice: 220, sellingPrice: 399, trackingType: 'BATCH', reorderLevel: 25, reorderQty: 80 },
    { name: 'Nescafe Gold Premium Rich Blend Coffee 200g', sku: 'FMCG-NES-GOLD', barcode: '8901234500165', categoryId: catBeverages._id, brand: 'Nestle', unit: 'Pcs', hsnCode: '2101', gstRate: 18, mrp: 850, purchasePrice: 510, sellingPrice: 720, trackingType: 'BATCH', reorderLevel: 15, reorderQty: 50 },
    { name: 'Dettol Germ Protection Handwash 900ml Refill', sku: 'FMCG-DET-900', barcode: '8901234500172', categoryId: catPersonalCare._id, brand: 'Dettol', unit: 'Pcs', hsnCode: '3401', gstRate: 18, mrp: 199, purchasePrice: 110, sellingPrice: 165, trackingType: 'BATCH', reorderLevel: 30, reorderQty: 100 },
    { name: 'Ferrero Rocher Hazelnut Pralines T24 Gift Box', sku: 'FMCG-FER-T24', barcode: '8901234500189', categoryId: catSnacks._id, brand: 'Ferrero', unit: 'Box', hsnCode: '1806', gstRate: 18, mrp: 1195, purchasePrice: 720, sellingPrice: 999, trackingType: 'BATCH', reorderLevel: 12, reorderQty: 40 },
    { name: 'Pringles Sour Cream & Onion Crisps 107g', sku: 'FMCG-PRING-SC', barcode: '8901234500196', categoryId: catSnacks._id, brand: 'Kelloggs', unit: 'Pcs', hsnCode: '1905', gstRate: 12, mrp: 130, purchasePrice: 75, sellingPrice: 110, trackingType: 'BATCH', reorderLevel: 40, reorderQty: 120 },

    // Stationery
    { name: 'Classmate Pulse Spiral Bound Notebook A4 (300 pgs)', sku: 'STAT-CLAS-A4', barcode: '8901234500202', categoryId: catStationery._id, brand: 'ITC', unit: 'Pcs', hsnCode: '4820', gstRate: 12, mrp: 180, purchasePrice: 90, sellingPrice: 145, trackingType: 'NONE', reorderLevel: 30, reorderQty: 100 },
    { name: 'Parker Vector Metallic CT Rollerball Pen', sku: 'STAT-PARK-VEC', barcode: '8901234500219', categoryId: catStationery._id, brand: 'Parker', unit: 'Pcs', hsnCode: '9608', gstRate: 18, mrp: 450, purchasePrice: 220, sellingPrice: 350, trackingType: 'NONE', reorderLevel: 10, reorderQty: 30 },
  ];

  const products = [];
  for (const pd of productsData) {
    const p = await InvProduct.create({ tenantId, ...pd });
    products.push(p);
  }
  console.log(`[Seed] ✓ ${products.length} Products created`);

  // 9. Suppliers (B2B Distributors)
  const suppliersData = [
    {
      name: 'Samsung India Electronics Ltd',
      gstin: '07AABCS1429B1Z4',
      pan: 'AABCS1429B',
      contactName: 'Rajiv Malhotra',
      phone: '+91 98110 54321',
      email: 'orders@samsung-dist.in',
      address: 'DLF Cyber City, Tower B, Level 7',
      city: 'Gurugram',
      state: 'Haryana',
      stateCode: '06',
      pincode: '122002',
      paymentTerms: 30,
      creditLimit: 2500000,
      bankDetails: { accountNo: '50200012345678', ifsc: 'HDFC0000123', bankName: 'HDFC Bank', branch: 'Cyber City' },
    },
    {
      name: 'Imagine Tresor Retail Supplies Pvt Ltd',
      gstin: '27AACCI8834M1Z2',
      pan: 'AACCI8834M',
      contactName: 'Sneha Kapur',
      phone: '+91 98205 99887',
      email: 'b2b@imaginetresor.com',
      address: 'Unit 12, Phoenix Palladium, Lower Parel',
      city: 'Mumbai',
      state: 'Maharashtra',
      stateCode: '27',
      pincode: '400013',
      paymentTerms: 15,
      creditLimit: 1000000,
      bankDetails: { accountNo: '000405001122', ifsc: 'ICIC0000004', bankName: 'ICICI Bank', branch: 'Nariman Point' },
    },
    {
      name: 'Tata Consumer Products Distribution',
      gstin: '27AAACT2702H1ZQ',
      pan: 'AAACT2702H',
      contactName: 'Arun Iyer',
      phone: '+91 98211 44556',
      email: 'fmcg-orders@tataconsumer.com',
      address: 'Kirloskar Business Park, Hebbal',
      city: 'Bengaluru',
      state: 'Karnataka',
      stateCode: '29',
      pincode: '560024',
      paymentTerms: 21,
      creditLimit: 800000,
      bankDetails: { accountNo: '9180200334455', ifsc: 'UTIB0000180', bankName: 'Axis Bank', branch: 'Indiranagar' },
    },
    {
      name: 'Havells India Commercial Division',
      gstin: '09AAACH1889L1Z8',
      pan: 'AAACH1889L',
      contactName: 'Deepak Saxena',
      phone: '+91 98711 22334',
      email: 'b2b@havells.com',
      address: 'QRG Towers, 2D Expressway',
      city: 'Noida',
      state: 'Uttar Pradesh',
      stateCode: '09',
      pincode: '201304',
      paymentTerms: 30,
      creditLimit: 1200000,
      bankDetails: { accountNo: '334455667788', ifsc: 'SBIN0001234', bankName: 'State Bank of India', branch: 'Noida Sector 18' },
    },
    {
      name: 'Ingram Micro India Pvt Ltd',
      gstin: '27AAACI1607C1Z6',
      pan: 'AAACI1607C',
      contactName: 'Manish Chawla',
      phone: '+91 98330 66778',
      email: 'enterprise@ingrammicro.in',
      address: 'Godrej Coliseum, Somaiya Hospital Road, Sion',
      city: 'Mumbai',
      state: 'Maharashtra',
      stateCode: '27',
      pincode: '400022',
      paymentTerms: 45,
      creditLimit: 1800000,
      bankDetails: { accountNo: '023420000112', ifsc: 'KKBK0000234', bankName: 'Kotak Mahindra Bank', branch: 'Bandra' },
    },
  ];

  const suppliers = [];
  for (const sd of suppliersData) {
    const s = await InvSupplier.create({ tenantId, ...sd });
    suppliers.push(s);
  }
  console.log(`[Seed] ✓ ${suppliers.length} Suppliers created`);

  // 10. Customers (B2B Corporate & Retail)
  const customersData = [
    {
      name: 'TechNova IT Solutions Pvt Ltd',
      gstin: '27AAACT9901R1Z1',
      pan: 'AAACT9901R',
      contactName: 'Vikram Sengupta',
      phone: '+91 98200 11223',
      email: 'procurement@technova.io',
      billingAddress: 'Tower 4, Mindspace SEZ, Airoli',
      city: 'Navi Mumbai',
      state: 'Maharashtra',
      stateCode: '27',
      pincode: '400708',
      paymentTerms: 30,
      creditLimit: 1500000,
    },
    {
      name: 'GreenLeaf Gourmet Café & Lounge',
      gstin: '27AABCG4412K1Z9',
      pan: 'AABCG4412K',
      contactName: 'Ananya Deshmukh',
      phone: '+91 98214 77889',
      email: 'accounts@greenleafcafe.in',
      billingAddress: 'Shop 4-6, Linking Road, Bandra West',
      city: 'Mumbai',
      state: 'Maharashtra',
      stateCode: '27',
      pincode: '400050',
      paymentTerms: 15,
      creditLimit: 300000,
    },
    {
      name: 'Rajesh Departmental Store & Wholesale',
      gstin: '27AABCR7712E1Z3',
      pan: 'AABCR7712E',
      contactName: 'Rajesh Agarwal',
      phone: '+91 98335 12345',
      email: 'rajeshstore.mumbai@gmail.com',
      billingAddress: '142 Crawford Market, Fort',
      city: 'Mumbai',
      state: 'Maharashtra',
      stateCode: '27',
      pincode: '400001',
      paymentTerms: 21,
      creditLimit: 600000,
    },
    {
      name: 'Walk-in Retail Club Members',
      gstin: null,
      contactName: 'Cash / Counter Sales',
      phone: '+91 98000 00000',
      email: 'pos-cash@apexretail.in',
      billingAddress: 'Apex Storefront Counter POS',
      city: 'Mumbai',
      state: 'Maharashtra',
      stateCode: '27',
      pincode: '400053',
      paymentTerms: 0,
      creditLimit: 0,
    },
    {
      name: 'Vikram Mehta Enterprises',
      gstin: '27AABCV3314Q1Z8',
      pan: 'AABCV3314Q',
      contactName: 'Vikram Mehta',
      phone: '+91 98211 22334',
      email: 'mehta.enterprises@gmail.com',
      billingAddress: 'Plot 18, MIDC Central Road, Andheri East',
      city: 'Mumbai',
      state: 'Maharashtra',
      stateCode: '27',
      pincode: '400093',
      paymentTerms: 30,
      creditLimit: 800000,
    },
    {
      name: 'Gupta General Trading Co.',
      gstin: '27AAACG5518P1Z5',
      pan: 'AAACG5518P',
      contactName: 'Suresh Gupta',
      phone: '+91 98333 44556',
      email: 'guptatraders.bom@gmail.com',
      billingAddress: '55 Princess Street, Kalbadevi',
      city: 'Mumbai',
      state: 'Maharashtra',
      stateCode: '27',
      pincode: '400002',
      paymentTerms: 30,
      creditLimit: 500000,
    },
  ];

  const customers = [];
  for (const cd of customersData) {
    const c = await InvCustomer.create({ tenantId, ...cd });
    customers.push(c);
  }
  console.log(`[Seed] ✓ ${customers.length} Customers created`);

  // 11. Initial Stock Ledger Entries (Realistic Stock Levels & Valuation)
  // Low stock products configured intentionally to verify alert center: boAt Airdopes (3 pcs) and Parker Vector (2 pcs)
  const initialStockConfigs = [
    { sku: 'ELEC-OP12-512', qty: 15, wh: whGodown._id, batch: null, exp: null },
    { sku: 'ELEC-S24U-256', qty: 8,  wh: whGodown._id, batch: null, exp: null },
    { sku: 'ELEC-APP-PRO2', qty: 20, wh: whGodown._id, batch: null, exp: null },
    { sku: 'ELEC-BOAT-441', qty: 3,  wh: whRetailCounter._id, batch: null, exp: null }, // Low Stock Alert! (3 <= 10)
    { sku: 'ELEC-SONY-XM5', qty: 6,  wh: whGodown._id, batch: null, exp: null },
    { sku: 'ACC-ANK-65W',   qty: 35, wh: whGodown._id, batch: null, exp: null },
    { sku: 'ACC-USBC-2M',   qty: 90, wh: whRetailCounter._id, batch: null, exp: null },
    { sku: 'ACC-LOGI-MX3S', qty: 14, wh: whGodown._id, batch: null, exp: null },
    { sku: 'ACC-SAND-1TB',  qty: 12, wh: whGodown._id, batch: null, exp: null },
    { sku: 'ACC-HDMI-2M',   qty: 45, wh: whRetailCounter._id, batch: null, exp: null },
    { sku: 'HOME-PHIL-AF4', qty: 8,  wh: whGodown._id, batch: null, exp: null },
    { sku: 'HOME-PRES-IND', qty: 16, wh: whGodown._id, batch: null, exp: null },
    { sku: 'HOME-HAV-FAN',  qty: 22, wh: whGodown._id, batch: null, exp: null },
    { sku: 'HOME-WIP-12W',  qty: 55, wh: whRetailCounter._id, batch: null, exp: null },
    { sku: 'FMCG-TEA-DARJ', qty: 60, wh: whGodown._id, batch: 'BATCH-26TEA-01', exp: new Date(Date.now() + 180 * 86400000) },
    { sku: 'FMCG-NES-GOLD', qty: 40, wh: whGodown._id, batch: 'BATCH-26NES-02', exp: new Date(Date.now() + 240 * 86400000) },
    { sku: 'FMCG-DET-900',  qty: 75, wh: whGodown._id, batch: 'BATCH-26DET-03', exp: new Date(Date.now() + 365 * 86400000) },
    { sku: 'FMCG-FER-T24',  qty: 28, wh: whRetailCounter._id, batch: 'BATCH-26FER-04', exp: new Date(Date.now() + 90 * 86400000) },
    { sku: 'FMCG-PRING-SC', qty: 85, wh: whRetailCounter._id, batch: 'BATCH-26PRG-05', exp: new Date(Date.now() + 120 * 86400000) },
    { sku: 'STAT-CLAS-A4',  qty: 90, wh: whRetailCounter._id, batch: null, exp: null },
    { sku: 'STAT-PARK-VEC', qty: 2,  wh: whRetailCounter._id, batch: null, exp: null }, // Low Stock Alert! (2 <= 10)
  ];

  for (const st of initialStockConfigs) {
    const prod = products.find(p => p.sku === st.sku);
    if (!prod) continue;
    await InvStockLedger.create({
      tenantId,
      productId: prod._id,
      warehouseId: st.wh,
      txnType: 'OPENING',
      date: new Date(Date.now() - 45 * 86400000),
      batchNo: st.batch,
      expiryDate: st.exp,
      qty: st.qty,
      unitCost: prod.purchasePrice,
      totalCost: st.qty * prod.purchasePrice,
      remarks: 'Initial Store Inventory Stock-In',
      createdBy: userId,
    });
  }
  console.log('[Seed] ✓ Stock Ledger movements recorded');

  // 12. Realistic Purchase Bills & Payments Out
  // We simulate 10 purchase bills across suppliers:
  // - 8 Paid in full with Payment Vouchers
  // - 1 Partially Paid
  // - 1 Unpaid (creating pending payable due ~₹1,15,000)
  const purchaseBills = [
    {
      voucherNo: 'BILL-2627-0101',
      supplier: suppliers[0], // Samsung
      amount: 540000,
      settledAmount: 540000,
      paymentStatus: 'PAID',
      date: new Date(Date.now() - 40 * 86400000),
      dueDate: new Date(Date.now() - 10 * 86400000),
      notes: '10x OnePlus 12 5G Flowy Emerald batch',
    },
    {
      voucherNo: 'BILL-2627-0102',
      supplier: suppliers[1], // Imagine
      amount: 175000,
      settledAmount: 175000,
      paymentStatus: 'PAID',
      date: new Date(Date.now() - 35 * 86400000),
      dueDate: new Date(Date.now() - 20 * 86400000),
      notes: '10x AirPods Pro 2nd Gen USB-C',
    },
    {
      voucherNo: 'BILL-2627-0103',
      supplier: suppliers[2], // Tata
      amount: 45000,
      settledAmount: 45000,
      paymentStatus: 'PAID',
      date: new Date(Date.now() - 30 * 86400000),
      dueDate: new Date(Date.now() - 9 * 86400000),
      notes: 'Darjeeling Tea & Gourmet Coffee supply',
    },
    {
      voucherNo: 'BILL-2627-0104',
      supplier: suppliers[3], // Havells
      amount: 68000,
      settledAmount: 68000,
      paymentStatus: 'PAID',
      date: new Date(Date.now() - 25 * 86400000),
      dueDate: new Date(Date.now() + 5 * 86400000),
      notes: 'Havells stealth fans and lighting',
    },
    {
      voucherNo: 'BILL-2627-0105',
      supplier: suppliers[4], // Ingram
      amount: 95000,
      settledAmount: 95000,
      paymentStatus: 'PAID',
      date: new Date(Date.now() - 20 * 86400000),
      dueDate: new Date(Date.now() + 25 * 86400000),
      notes: 'Logitech mice and SanDisk SSDs',
    },
    {
      voucherNo: 'BILL-2627-0106',
      supplier: suppliers[0], // Samsung
      amount: 204000,
      settledAmount: 204000,
      paymentStatus: 'PAID',
      date: new Date(Date.now() - 15 * 86400000),
      dueDate: new Date(Date.now() + 15 * 86400000),
      notes: '2x Galaxy S24 Ultra Titanium stock',
    },
    {
      voucherNo: 'BILL-2627-0107',
      supplier: suppliers[2], // Tata
      amount: 28000,
      settledAmount: 28000,
      paymentStatus: 'PAID',
      date: new Date(Date.now() - 10 * 86400000),
      dueDate: new Date(Date.now() + 11 * 86400000),
      notes: 'Personal care handwash & hygiene',
    },
    {
      voucherNo: 'BILL-2627-0108',
      supplier: suppliers[1], // Imagine
      amount: 48000,
      settledAmount: 28000, // Partially paid -> Due ₹20,000
      paymentStatus: 'PARTIALLY_PAID',
      date: new Date(Date.now() - 6 * 86400000),
      dueDate: new Date(Date.now() + 9 * 86400000),
      notes: '2x Sony XM5 ANC Headphones',
    },
    {
      voucherNo: 'BILL-2627-0109',
      supplier: suppliers[4], // Ingram
      amount: 45000,
      settledAmount: 0, // Unpaid -> Due ₹45,000
      paymentStatus: 'UNPAID',
      date: new Date(Date.now() - 4 * 86400000),
      dueDate: new Date(Date.now() + 41 * 86400000),
      notes: 'Anker GaN wall chargers & USB-C cables',
    },
    {
      voucherNo: 'BILL-2627-0110',
      supplier: suppliers[3], // Havells
      amount: 50000,
      settledAmount: 0, // Unpaid -> Due ₹50,000
      paymentStatus: 'UNPAID',
      date: new Date(Date.now() - 2 * 86400000),
      dueDate: new Date(Date.now() + 28 * 86400000),
      notes: 'Prestige induction cooktops & Wipro smart bulbs',
    },
  ];

  const createdBills = [];
  for (const b of purchaseBills) {
    const billDoc = await InvPaymentTransaction.create({
      tenantId,
      voucherNo: b.voucherNo,
      partyType: 'SUPPLIER',
      partyId: b.supplier._id,
      partyModel: 'InvSupplier',
      txnType: 'BILL',
      amount: b.amount,
      paymentMode: 'CREDIT',
      paymentDate: b.date,
      dueDate: b.dueDate,
      settledAmount: b.settledAmount,
      paymentStatus: b.paymentStatus,
      notes: b.notes,
      createdBy: userId,
    });
    createdBills.push(billDoc);
  }

  // 12. Seed Simulated Bank Accounts (HDFC Operational & ICICI Vendor Payouts)
  await BankAccount.deleteMany({ tenantId });

  const hdfcBank = await BankAccount.create({
    tenantId,
    bankName: 'HDFC Bank',
    accountName: 'HDFC Main Operational A/C',
    accountNumber: '50200099881122',
    ifscCode: 'HDFC0000123',
    branchName: 'Koramangala, Bengaluru',
    accountType: 'CURRENT',
    upiId: 'apexretail@hdfcbank',
    openingBalance: 200000,
    isDefault: true,
    isActive: true,
    notes: 'Primary business operating current account',
    createdBy: userId,
  });

  const iciciBank = await BankAccount.create({
    tenantId,
    bankName: 'ICICI Bank',
    accountName: 'ICICI Vendor Payouts A/C',
    accountNumber: '91900088776655',
    ifscCode: 'ICIC0001040',
    branchName: 'Indiranagar, Bengaluru',
    accountType: 'CURRENT',
    upiId: 'apexretail@icici',
    openingBalance: 100000,
    isDefault: false,
    isActive: true,
    notes: 'Secondary account for vendor payments & bulk supplies',
    createdBy: userId,
  });

  console.log(`[Seed] ✓ 2 Simulated Bank Accounts created: HDFC (****1122) & ICICI (****6655)`);

  // Matching Payment Out Vouchers for Settled Bills
  const paymentOutVouchers = [
    { voucherNo: 'PAY-2627-0101', partyId: suppliers[0]._id, amount: 540000, mode: 'NEFT_RTGS', ref: 'HDFCN26270011234', bankId: hdfcBank._id, bankLabel: 'HDFC Bank (****1122)', date: new Date(Date.now() - 38 * 86400000), bill: createdBills[0] },
    { voucherNo: 'PAY-2627-0102', partyId: suppliers[1]._id, amount: 175000, mode: 'UPI', ref: 'UPI/9820599887@icici', bankId: iciciBank._id, bankLabel: 'ICICI Bank (****6655)', date: new Date(Date.now() - 32 * 86400000), bill: createdBills[1] },
    { voucherNo: 'PAY-2627-0103', partyId: suppliers[2]._id, amount: 45000,  mode: 'NEFT_RTGS', ref: 'AXISN26270088991', bankId: hdfcBank._id, bankLabel: 'HDFC Bank (****1122)', date: new Date(Date.now() - 28 * 86400000), bill: createdBills[2] },
    { voucherNo: 'PAY-2627-0104', partyId: suppliers[3]._id, amount: 68000,  mode: 'CHEQUE', ref: 'CHQ-880123', bankId: hdfcBank._id, bankLabel: 'HDFC Bank (****1122)', date: new Date(Date.now() - 22 * 86400000), bill: createdBills[3] },
    { voucherNo: 'PAY-2627-0105', partyId: suppliers[4]._id, amount: 95000,  mode: 'NEFT_RTGS', ref: 'KOTAKN2627009988', bankId: iciciBank._id, bankLabel: 'ICICI Bank (****6655)', date: new Date(Date.now() - 18 * 86400000), bill: createdBills[4] },
    { voucherNo: 'PAY-2627-0106', partyId: suppliers[0]._id, amount: 204000, mode: 'NEFT_RTGS', ref: 'HDFCN26270044556', bankId: hdfcBank._id, bankLabel: 'HDFC Bank (****1122)', date: new Date(Date.now() - 12 * 86400000), bill: createdBills[5] },
    { voucherNo: 'PAY-2627-0107', partyId: suppliers[2]._id, amount: 28000,  mode: 'UPI', ref: 'UPI/tataconsumer@axis', bankId: hdfcBank._id, bankLabel: 'HDFC Bank (****1122)', date: new Date(Date.now() - 8 * 86400000), bill: createdBills[6] },
    { voucherNo: 'PAY-2627-0108', partyId: suppliers[1]._id, amount: 28000,  mode: 'UPI', ref: 'UPI/tresor@icici', bankId: iciciBank._id, bankLabel: 'ICICI Bank (****6655)', date: new Date(Date.now() - 4 * 86400000), bill: createdBills[7] },
  ];

  for (const p of paymentOutVouchers) {
    const supp = suppliers.find(s => s._id.toString() === p.partyId.toString());
    await InvPaymentTransaction.create({
      tenantId,
      voucherNo: p.voucherNo,
      partyType: 'SUPPLIER',
      partyId: p.partyId,
      partyName: supp?.name || 'Supplier',
      partyModel: 'InvSupplier',
      txnType: 'PAYMENT_OUT',
      amount: p.amount,
      paymentMode: p.mode,
      paymentDate: p.date,
      referenceNo: p.ref,
      bankAccountId: p.bankId,
      sourceName: `🏦 ${p.bankLabel}`,
      destinationName: supp?.name || 'Supplier',
      notes: `Supplier payment settlement against ${p.bill.voucherNo}`,
      allocatedBills: [
        {
          billId: p.bill._id,
          voucherNo: p.bill.voucherNo,
          allocatedAmount: p.amount,
          remainingBillBalance: Math.max(0, p.bill.amount - p.amount),
        },
      ],
      createdBy: userId,
    });
  }
  console.log(`[Seed] ✓ ${createdBills.length} Purchase Bills & ${paymentOutVouchers.length} Payment Vouchers recorded`);

  // 13. Realistic Sales Invoices & Collections
  const salesInvoices = [
    {
      voucherNo: 'INV-2627-0101',
      customer: customers[0], // TechNova Corporate
      amount: 324995,
      settledAmount: 324995,
      paymentStatus: 'PAID',
      date: new Date(Date.now() - 42 * 86400000),
      dueDate: new Date(Date.now() - 12 * 86400000),
      notes: '5x OnePlus 12 5G corporate procurement',
    },
    {
      voucherNo: 'INV-2627-0102',
      customer: customers[1], // GreenLeaf Cafe
      amount: 35000,
      settledAmount: 35000,
      paymentStatus: 'PAID',
      date: new Date(Date.now() - 36 * 86400000),
      dueDate: new Date(Date.now() - 21 * 86400000),
      notes: 'Monthly Darjeeling Tea & Nescafe coffee supply',
    },
    {
      voucherNo: 'INV-2627-0103',
      customer: customers[3], // Walk-in Counter Cash
      amount: 140000,
      settledAmount: 140000,
      paymentStatus: 'PAID',
      date: new Date(Date.now() - 30 * 86400000),
      dueDate: new Date(Date.now() - 30 * 86400000),
      notes: 'Weekend retail counter sales & appliances (Cash)',
    },
    {
      voucherNo: 'INV-2627-0104',
      customer: customers[2], // Rajesh Departmental Store
      amount: 85000,
      settledAmount: 85000,
      paymentStatus: 'PAID',
      date: new Date(Date.now() - 24 * 86400000),
      dueDate: new Date(Date.now() - 3 * 86400000),
      notes: 'FMCG personal care and confectionery bulk order',
    },
    {
      voucherNo: 'INV-2627-0105',
      customer: customers[4], // Vikram Mehta
      amount: 119999,
      settledAmount: 119999,
      paymentStatus: 'PAID',
      date: new Date(Date.now() - 20 * 86400000),
      dueDate: new Date(Date.now() + 10 * 86400000),
      notes: '1x Samsung Galaxy S24 Ultra Titanium',
    },
    {
      voucherNo: 'INV-2627-0106',
      customer: customers[3], // Walk-in Counter Cash
      amount: 140000,
      settledAmount: 140000,
      paymentStatus: 'PAID',
      date: new Date(Date.now() - 16 * 86400000),
      dueDate: new Date(Date.now() - 16 * 86400000),
      notes: 'Storefront direct consumer electronics sales (Cash)',
    },
    {
      voucherNo: 'INV-2627-0107',
      customer: customers[0], // TechNova Corporate
      amount: 224900,
      settledAmount: 224900,
      paymentStatus: 'PAID',
      date: new Date(Date.now() - 12 * 86400000),
      dueDate: new Date(Date.now() + 18 * 86400000),
      notes: '10x Apple AirPods Pro 2 for leadership team',
    },
    {
      voucherNo: 'INV-2627-0108',
      customer: customers[1], // GreenLeaf Cafe
      amount: 45000,
      settledAmount: 45000,
      paymentStatus: 'PAID',
      date: new Date(Date.now() - 8 * 86400000),
      dueDate: new Date(Date.now() + 7 * 86400000),
      notes: 'Kitchen air fryer and induction cooktops',
    },
    {
      voucherNo: 'INV-2627-0109',
      customer: customers[2], // Rajesh Departmental
      amount: 120000,
      settledAmount: 70000, // Partially paid -> Due ₹50,000
      paymentStatus: 'PARTIALLY_PAID',
      date: new Date(Date.now() - 5 * 86400000),
      dueDate: new Date(Date.now() + 16 * 86400000),
      notes: 'Festive confectionery & snack crates supply',
    },
    {
      voucherNo: 'INV-2627-0110',
      customer: customers[4], // Vikram Mehta
      amount: 89950,
      settledAmount: 39950, // Partially paid -> Due ₹50,000
      paymentStatus: 'PARTIALLY_PAID',
      date: new Date(Date.now() - 3 * 86400000),
      dueDate: new Date(Date.now() + 27 * 86400000),
      notes: '10x Logitech MX Master 3S mice package',
    },
    {
      voucherNo: 'INV-2627-0111',
      customer: customers[5], // Gupta General Trading (Critical Overdue!)
      amount: 145000,
      settledAmount: 0, // Overdue by 32 days! -> Due ₹1,45,000
      paymentStatus: 'UNPAID',
      date: new Date(Date.now() - 62 * 86400000),
      dueDate: new Date(Date.now() - 32 * 86400000),
      notes: 'Audio gadgets & USB accessories wholesale shipment',
    },
    {
      voucherNo: 'INV-2627-0112',
      customer: customers[0], // TechNova Corporate
      amount: 75000,
      settledAmount: 0, // Current pending -> Due ₹75,000
      paymentStatus: 'UNPAID',
      date: new Date(Date.now() - 2 * 86400000),
      dueDate: new Date(Date.now() + 28 * 86400000),
      notes: 'SanDisk 1TB SSDs & 65W GaN wall adapters',
    },
  ];

  const createdInvoices = [];
  for (const inv of salesInvoices) {
    const invDoc = await InvPaymentTransaction.create({
      tenantId,
      voucherNo: inv.voucherNo,
      partyType: 'CUSTOMER',
      partyId: inv.customer._id,
      partyName: inv.customer.name,
      partyModel: 'InvCustomer',
      txnType: 'INVOICE',
      amount: inv.amount,
      paymentMode: 'CREDIT',
      paymentDate: inv.date,
      dueDate: inv.dueDate,
      settledAmount: inv.settledAmount,
      paymentStatus: inv.paymentStatus,
      notes: inv.notes,
      createdBy: userId,
    });
    createdInvoices.push(invDoc);
  }

  // Matching Payment In Receipts / Collections
  const paymentInReceipts = [
    { voucherNo: 'REC-2627-0101', customer: customers[0], amount: 324995, mode: 'NEFT_RTGS', ref: 'HDFCR26270019921', bankId: hdfcBank._id, bankLabel: 'HDFC Bank (****1122)', date: new Date(Date.now() - 40 * 86400000), inv: createdInvoices[0] },
    { voucherNo: 'REC-2627-0102', customer: customers[1], amount: 35000,  mode: 'UPI', ref: 'UPI/greenleaf@okaxis', bankId: hdfcBank._id, bankLabel: 'HDFC Bank (****1122)', date: new Date(Date.now() - 34 * 86400000), inv: createdInvoices[1] },
    { voucherNo: 'REC-2627-0103', customer: customers[3], amount: 140000, mode: 'CASH', ref: 'CASH-POS-DRAWER-01', bankId: null, bankLabel: 'Cash in Hand', date: new Date(Date.now() - 30 * 86400000), inv: createdInvoices[2] },
    { voucherNo: 'REC-2627-0104', customer: customers[2], amount: 85000,  mode: 'UPI', ref: 'UPI/rajeshstore@paytm', bankId: hdfcBank._id, bankLabel: 'HDFC Bank (****1122)', date: new Date(Date.now() - 22 * 86400000), inv: createdInvoices[3] },
    { voucherNo: 'REC-2627-0105', customer: customers[4], amount: 119999, mode: 'CARD', ref: 'POS-TXN-984412', bankId: hdfcBank._id, bankLabel: 'HDFC Bank (****1122)', date: new Date(Date.now() - 18 * 86400000), inv: createdInvoices[4] },
    { voucherNo: 'REC-2627-0106', customer: customers[3], amount: 140000, mode: 'CASH', ref: 'CASH-POS-DRAWER-02', bankId: null, bankLabel: 'Cash in Hand', date: new Date(Date.now() - 16 * 86400000), inv: createdInvoices[5] },
    { voucherNo: 'REC-2627-0107', customer: customers[0], amount: 224900, mode: 'NEFT_RTGS', ref: 'ICICR26270055667', bankId: iciciBank._id, bankLabel: 'ICICI Bank (****6655)', date: new Date(Date.now() - 10 * 86400000), inv: createdInvoices[6] },
    { voucherNo: 'REC-2627-0108', customer: customers[1], amount: 45000,  mode: 'UPI', ref: 'UPI/ananya@okhdfc', bankId: hdfcBank._id, bankLabel: 'HDFC Bank (****1122)', date: new Date(Date.now() - 6 * 86400000), inv: createdInvoices[7] },
    { voucherNo: 'REC-2627-0109', customer: customers[2], amount: 70000,  mode: 'UPI', ref: 'UPI/rajeshagarwal@icici', bankId: iciciBank._id, bankLabel: 'ICICI Bank (****6655)', date: new Date(Date.now() - 4 * 86400000), inv: createdInvoices[8] },
    { voucherNo: 'REC-2627-0110', customer: customers[4], amount: 39950,  mode: 'CARD', ref: 'POS-TXN-110293', bankId: hdfcBank._id, bankLabel: 'HDFC Bank (****1122)', date: new Date(Date.now() - 2 * 86400000), inv: createdInvoices[9] },
  ];

  for (const r of paymentInReceipts) {
    const isCash = r.mode === 'CASH';
    await InvPaymentTransaction.create({
      tenantId,
      voucherNo: r.voucherNo,
      partyType: 'CUSTOMER',
      partyId: r.customer._id,
      partyName: r.customer.name,
      partyModel: 'InvCustomer',
      txnType: 'PAYMENT_IN',
      amount: r.amount,
      paymentMode: r.mode,
      paymentDate: r.date,
      referenceNo: r.ref,
      bankAccountId: r.bankId,
      sourceName: r.customer.name,
      destinationName: isCash ? '💵 Cash Register (In Hand)' : `🏦 ${r.bankLabel}`,
      notes: `Customer collection receipt against invoice #${r.inv.voucherNo}`,
      allocatedBills: [
        {
          billId: r.inv._id,
          voucherNo: r.inv.voucherNo,
          allocatedAmount: r.amount,
          remainingBillBalance: Math.max(0, r.inv.amount - r.amount),
        },
      ],
      createdBy: userId,
    });
  }

  // 14. Initial Bank Operating Capital & Contra Transfers
  await InvPaymentTransaction.create({
    tenantId,
    voucherNo: 'REC-2627-0100',
    partyType: 'CUSTOMER',
    partyId: customers[0]._id,
    partyName: 'TechNova Corporate Solutions (Capital Infusion)',
    partyModel: 'InvCustomer',
    txnType: 'PAYMENT_IN',
    amount: 500000,
    paymentMode: 'NEFT_RTGS',
    paymentDate: new Date(Date.now() - 45 * 86400000),
    referenceNo: 'CAPITAL-OPENING-2608',
    bankAccountId: hdfcBank._id,
    sourceName: 'TechNova Corporate Solutions (Promoter Capital)',
    destinationName: '🏦 HDFC Bank (****1122)',
    notes: 'Initial Store Operating Capital & Bank Liquidity Reserve',
    createdBy: userId,
  });

  // Seed Contra Transfers between Cash <-> Bank and Bank <-> Bank
  await InvPaymentTransaction.insertMany([
    {
      tenantId,
      voucherNo: 'DEP-2627-0001',
      partyType: 'INTERNAL',
      partyName: `Contra: Cash Register ➔ HDFC Bank`,
      txnType: 'CONTRA',
      isOutsideCashflow: true,
      cashflowCategory: 'CASH_DEPOSIT_BANK',
      amount: 50000,
      paymentMode: 'CASH',
      paymentDate: new Date(Date.now() - 25 * 86400000),
      referenceNo: 'CASH-DEP-BR-01',
      bankAccountId: hdfcBank._id,
      sourceName: '💵 Cash Register (In Hand)',
      destinationName: '🏦 HDFC Bank (****1122)',
      notes: 'Daily counter cash surplus deposit into primary current account',
      createdBy: userId,
    },
    {
      tenantId,
      voucherNo: 'TXF-2627-0001',
      partyType: 'INTERNAL',
      partyName: `Contra: HDFC Bank ➔ ICICI Bank`,
      txnType: 'CONTRA',
      isOutsideCashflow: true,
      cashflowCategory: 'INTER_BANK_TRANSFER',
      amount: 75000,
      paymentMode: 'NET_BANKING',
      paymentDate: new Date(Date.now() - 15 * 86400000),
      referenceNo: 'HDFC-IMPS-89912304',
      bankAccountId: hdfcBank._id,
      toBankAccountId: iciciBank._id,
      sourceName: '🏦 HDFC Bank (****1122)',
      destinationName: '🏦 ICICI Bank (****6655)',
      notes: 'Fund transfer to ICICI vendor payouts account for upcoming supplier clearances',
      createdBy: userId,
    },
  ]);

  console.log(`[Seed] ✓ ${createdInvoices.length} Sales Invoices, ${paymentInReceipts.length} Collections Receipts & Initial Capital recorded`);

  await mongoose.disconnect();
  console.log('\n=============================================================');
  console.log(' SEED COMPLETE — REALISTIC RETAIL STORE SIMULATION ACTIVE');
  console.log('=============================================================');
  console.log('🏢 Primary Company:     Apex Retail & Supermart Ltd (Active)');
  console.log('📦 Total Catalog Items:  20 Products (Electronics, FMCG, Home, Stationery)');
  console.log('🏭 Active Suppliers:    5 Indian B2B Distributors (Samsung, Imagine, Tata, etc.)');
  console.log('👥 Active Customers:    6 Accounts (TechNova Corporate, GreenLeaf, Walk-in POS, etc.)');
  console.log('💰 Sales & Collections:  12 Bills (₹18.4 Lakhs Invoiced, ₹15.2 Lakhs Collected)');
  console.log('📥 Purchases & Payments: 10 Bills (₹12.5 Lakhs Billed, ₹11.35 Lakhs Paid)');
  console.log('💵 Cash in Hand:         ₹2,80,000 (Positive store cash drawer)');
  console.log('🏛️ Bank / UPI Balance:   ₹2,00,000 (Positive business bank balance)');
  console.log('🚨 Alerts Triggered:     boAt Airdopes (Low Stock) & Gupta Traders (Overdue Lena)');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('🔑 Login Credentials:');
  console.log('   1. Super Admin:       admin@platform.com  / Admin@1234');
  console.log('   2. Company Admin:     admin@apexretail.in / Password@123');
  console.log('   3. Demo Aliases:      admin@acme.com      / Password@123');
  console.log('                         test@example.com    / Password@123');
  console.log('=============================================================\n');

  process.exit(0);
}

seed().catch((err) => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});

