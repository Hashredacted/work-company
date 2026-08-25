'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Role = require('../models/Role');
const { createRole, listRoles, deleteRole } = require('../controllers/role');
const { createUser, listUsers, deleteUser } = require('../controllers/user');

async function testSprint4() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[Test] Connected to MongoDB');

  // 1. Create a test tenant
  const testTenant = await Tenant.create({
    name: 'RBAC Test Tenant ' + Date.now(),
    email: `rbac_test_${Date.now()}@example.com`,
    status: 'TRIAL',
  });

  const tenantAdmin = await User.create({
    tenantId: testTenant._id,
    name: 'Admin User',
    email: `admin_${Date.now()}@example.com`,
    password: 'Password@123',
  });

  const mockAdminReq = {
    tenantId: testTenant._id,
    user: tenantAdmin,
    isSuperAdmin: false,
    body: {
      name: 'Custom Support Role',
      permissions: ['user:read', 'company:read'],
    },
  };

  let createdRoleData = null;
  const mockRes = {
    status(code) { this.statusCode = code; return this; },
    json(data) { createdRoleData = data; return this; },
  };

  // 2. Test create custom role
  await createRole(mockAdminReq, mockRes, (err) => { if (err) throw err; });
  console.log('[Test] Create custom role status:', mockRes.statusCode);
  console.log('[Test] Created role:', createdRoleData.data.name, 'Permissions:', createdRoleData.data.permissions);
  if (mockRes.statusCode !== 201 || createdRoleData.data.name !== 'Custom Support Role') {
    throw new Error('Role creation failed');
  }

  // 3. Test create user assigned to the custom role
  const mockCreateUserReq = {
    tenantId: testTenant._id,
    user: tenantAdmin,
    isSuperAdmin: false,
    body: {
      name: 'Support Agent',
      email: `agent_${Date.now()}@example.com`,
      password: 'Password@123',
      roleId: createdRoleData.data._id.toString(),
    },
  };
  let createdUserData = null;
  const mockUserRes = {
    status(code) { this.statusCode = code; return this; },
    json(data) { createdUserData = data; return this; },
  };
  await createUser(mockCreateUserReq, mockUserRes, (err) => { if (err) throw err; });
  console.log('[Test] Create team user status:', mockUserRes.statusCode);
  console.log('[Test] Created user:', createdUserData.data.name, 'Assigned role:', createdUserData.data.roleId.name);
  if (mockUserRes.statusCode !== 201 || createdUserData.data.roleId.name !== 'Custom Support Role') {
    throw new Error('User creation failed');
  }

  // 4. Test delete role rejection when users are assigned
  const mockDeleteRoleReq = {
    tenantId: testTenant._id,
    user: tenantAdmin,
    isSuperAdmin: false,
    params: { id: createdRoleData.data._id.toString() },
  };
  let deleteRoleErr = null;
  const mockDeleteRoleRes = {
    status(code) { this.statusCode = code; return this; },
    json(data) { deleteRoleErr = data; return this; },
  };
  await deleteRole(mockDeleteRoleReq, mockDeleteRoleRes, () => {});
  console.log('[Test] Delete role with active users blocked with 409:', mockDeleteRoleRes.statusCode === 409);
  if (mockDeleteRoleRes.statusCode !== 409) {
    throw new Error('Should block deletion of role with assigned users');
  }

  // 5. Clean up
  await User.deleteMany({ tenantId: testTenant._id });
  await Role.deleteMany({ tenantId: testTenant._id });
  await Tenant.deleteOne({ _id: testTenant._id });
  console.log('[Test] Test records cleaned up.');

  await mongoose.disconnect();
  console.log('[Test] Sprint 4 verification PASSED successfully!');
}

testSprint4().catch((err) => {
  console.error('[Test] Error:', err);
  process.exit(1);
});
