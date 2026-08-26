'use strict';

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const { connectDB } = require('../config/db');
const Tenant = require('../models/Tenant');
const { seedIndianPresetsForTenant } = require('../controllers/inventory/category');

async function run() {
  await connectDB();
  console.log('[Seed] Connected to MongoDB');

  const tenants = await Tenant.find({ deletedAt: null });
  console.log(`[Seed] Found ${tenants.length} tenant(s)`);

  for (const t of tenants) {
    console.log(`[Seed] Seeding Indian categories for tenant: ${t.name} (${t._id})`);
    await seedIndianPresetsForTenant(t._id);
  }

  console.log('[Seed] All tenants seeded with Indian category presets successfully!');
  process.exit(0);
}

run().catch(err => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
