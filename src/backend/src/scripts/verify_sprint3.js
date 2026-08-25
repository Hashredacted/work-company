'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const { getDashboardStats } = require('../controllers/dashboard');
const { getCompanyById, updateCompanyStatus } = require('../controllers/company');

async function testSprint3() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[Test] Connected to MongoDB');

  // 1. Test getDashboardStats with mock Super Admin req
  const mockSuperAdminReq = {
    isSuperAdmin: true,
    user: { name: 'Super Admin' },
  };

  let statsData = null;
  const mockRes = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      statsData = payload;
      return this;
    },
  };

  await getDashboardStats(mockSuperAdminReq, mockRes, (err) => { if (err) throw err; });
  console.log('[Test] getDashboardStats response code:', mockRes.statusCode);
  console.log('[Test] KPI Metrics:', statsData.data.kpis);

  if (mockRes.statusCode !== 200 || !statsData.data.kpis) {
    throw new Error('Failed to retrieve dashboard stats');
  }

  // 2. Test Non-Super-Admin rejection (403)
  const mockTenantReq = {
    isSuperAdmin: false,
    tenantId: '6a8beac0cb1121ee38bfac72',
  };
  let rejected = false;
  const mockResReject = {
    status(code) {
      if (code === 403) rejected = true;
      return this;
    },
    json() { return this; },
  };
  await getDashboardStats(mockTenantReq, mockResReject, () => {});
  console.log('[Test] Non-Super-Admin 403 Forbidden check:', rejected);
  if (!rejected) throw new Error('Non-super-admin was not rejected with 403');

  // 3. Test status update on a temporary tenant
  const tempTenant = await Tenant.create({
    name: 'Status Test Co',
    email: `status_test_${Date.now()}@example.com`,
    status: 'TRIAL',
  });

  const mockUpdateReq = {
    isSuperAdmin: true,
    params: { id: tempTenant._id.toString() },
    body: { status: 'ACTIVE' },
  };
  let updateResult = null;
  const mockUpdateRes = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { updateResult = payload; return this; },
  };

  await updateCompanyStatus(mockUpdateReq, mockUpdateRes, (err) => { if (err) throw err; });
  console.log('[Test] Update status response:', updateResult.message);
  if (updateResult.data.status !== 'ACTIVE') throw new Error('Status was not updated to ACTIVE');

  // Clean up
  await Tenant.deleteOne({ _id: tempTenant._id });
  console.log('[Test] Cleaned up temporary tenant.');

  await mongoose.disconnect();
  console.log('[Test] Sprint 3 verification PASSED successfully!');
}

testSprint3().catch((err) => {
  console.error('[Test] Error:', err);
  process.exit(1);
});
