'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const mongoose = require('mongoose');
const Role = require('../models/Role');
const Tenant = require('../models/Tenant');
const Warehouse = require('../models/inv/Warehouse');
const Category = require('../models/inv/Category');

const INV_ALL = [
  'inventory:read',
  'inventory:manage',
  'inventory:orders',
  'inventory:approve',
  'inventory:reports',
  'inventory:admin',
];

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[Migrate] Connected to MongoDB');

  // Update super_admin
  await Role.updateOne(
    { name: 'super_admin' },
    { $addToSet: { permissions: { $each: INV_ALL } } }
  );
  console.log('[Migrate] Updated super_admin role permissions');

  // Update company_admin
  await Role.updateOne(
    { name: 'company_admin' },
    { $addToSet: { permissions: { $each: INV_ALL } } }
  );
  console.log('[Migrate] Updated company_admin role permissions');

  // Update manager
  await Role.updateOne(
    { name: 'manager' },
    { $addToSet: { permissions: { $each: ['inventory:read', 'inventory:orders'] } } }
  );
  console.log('[Migrate] Updated manager role permissions');

  // Update hr_manager
  await Role.updateOne(
    { name: 'hr_manager' },
    { $addToSet: { permissions: { $each: ['company:read', 'user:read', 'user:create', 'user:update', 'user:delete', 'role:read'] } } }
  );
  console.log('[Migrate] Updated hr_manager role permissions');

  // Update billing_manager
  await Role.updateOne(
    { name: 'billing_manager' },
    { $addToSet: { permissions: { $each: ['inventory:read', 'inventory:reports'] } } }
  );
  console.log('[Migrate] Updated billing_manager role permissions');

  // Update auditor
  await Role.updateOne(
    { name: 'auditor' },
    { $addToSet: { permissions: { $each: ['inventory:read', 'inventory:reports'] } } }
  );
  console.log('[Migrate] Updated auditor role permissions');

  // Update viewer
  await Role.updateOne(
    { name: 'viewer' },
    { $addToSet: { permissions: { $each: ['inventory:read'] } } }
  );
  console.log('[Migrate] Updated viewer role permissions');

  // Update custom tenant roles (e.g. Team Member)
  await Role.updateMany(
    { isSystemRole: false },
    { $addToSet: { permissions: { $each: ['inventory:read', 'inventory:orders'] } } }
  );
  console.log('[Migrate] Updated custom workspace roles');

  // Provision default warehouse and category for any active tenant without one
  const tenants = await Tenant.find({ deletedAt: null });
  for (const t of tenants) {
    const whCount = await Warehouse.countDocuments({ tenantId: t._id });
    if (whCount === 0) {
      const codePrefix = (t.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4) || 'WH').toUpperCase();
      await Warehouse.create({
        tenantId: t._id,
        name: 'Main Godown',
        code: `WH-${codePrefix}-01`,
        type: 'OWNED',
        city: 'Mumbai',
        state: 'Maharashtra',
        stateCode: '27',
        pincode: '400001',
        isDefault: true,
      });
      console.log(`[Migrate] Created default warehouse for tenant: ${t.name}`);
    }

    const catCount = await Category.countDocuments({ tenantId: t._id });
    if (catCount === 0) {
      await Category.create({
        tenantId: t._id,
        name: 'General',
        description: 'General products and merchandise',
      });
      console.log(`[Migrate] Created default category for tenant: ${t.name}`);
    }
  }

  const updatedRoles = await Role.find({});
  console.log('[Migrate] Current Roles in DB:');
  updatedRoles.forEach(r => {
    console.log(` - Role ${r.name}: ${r.permissions.length} permissions`);
  });

  await mongoose.disconnect();
  console.log('[Migrate] Migration complete!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('[Migrate] Error:', err);
  process.exit(1);
});
