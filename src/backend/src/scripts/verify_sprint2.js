'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Role = require('../models/Role');
const jwt = require('jsonwebtoken');

async function testSprint2() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[Test] Connected to MongoDB');

  const testEmail = `test_company_${Date.now()}@example.com`;
  const adminEmail = `admin_${Date.now()}@example.com`;

  // 1. Fetch company_admin role
  const companyAdminRole = await Role.findOne({ name: 'company_admin', isSystemRole: true });
  if (!companyAdminRole) throw new Error('company_admin role not found. Run seed.');

  // 2. Simulate Registration
  const trialStartedAt = new Date();
  const trialEndsAt = new Date(trialStartedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

  const tenant = await Tenant.create({
    name: 'Test Acme Corp',
    email: testEmail,
    phone: '+91 99999 88888',
    address: '100 Silicon Way',
    gst: '29ABCDE1234F1Z5',
    license: 'LIC-2026-001',
    status: 'TRIAL',
    trialStartedAt,
    trialEndsAt,
  });

  const user = await User.create({
    tenantId: tenant._id,
    name: 'Acme Admin',
    email: adminEmail,
    password: 'Password@123',
    roleId: companyAdminRole._id,
  });

  console.log('[Test] Tenant created with 7-Day Trial:', {
    tenantId: tenant._id,
    status: tenant.status,
    trialStartedAt: tenant.trialStartedAt,
    trialEndsAt: tenant.trialEndsAt,
  });

  // 3. Verify trial duration is exactly 7 days
  const diffDays = (tenant.trialEndsAt - tenant.trialStartedAt) / (1000 * 60 * 60 * 24);
  console.log('[Test] Trial duration calculation (days):', diffDays);
  if (diffDays !== 7) throw new Error(`Expected 7 days, got ${diffDays}`);

  // 4. Verify user password compare
  const isMatch = await user.comparePassword('Password@123');
  console.log('[Test] Password compare match:', isMatch);
  if (!isMatch) throw new Error('Password mismatch');

  // 5. Clean up test records
  await User.deleteOne({ _id: user._id });
  await Tenant.deleteOne({ _id: tenant._id });
  console.log('[Test] Test records cleaned up.');

  await mongoose.disconnect();
  console.log('[Test] Sprint 2 validation PASSED successfully!');
}

testSprint2().catch((err) => {
  console.error('[Test] Error:', err);
  process.exit(1);
});
