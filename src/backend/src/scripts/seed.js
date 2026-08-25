'use strict';

/**
 * Seed Script — Run with: npm run seed
 * Creates:
 *   - SaaS pricing plans
 *   - System roles (super_admin, company_admin + 5 expanded roles)
 *   - Demo tenants and users for testing
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const Role = require('../models/Role');
const Tenant = require('../models/Tenant');
const Plan = require('../models/Plan');

const SUPER_ADMIN_PERMISSIONS = [
  'company:read', 'company:create', 'company:update', 'company:delete',
  'user:read', 'user:create', 'user:update', 'user:delete',
  'role:read', 'role:create', 'role:update', 'role:delete',
  'billing:read', 'billing:manage',
  'subscription:read', 'subscription:manage',
  'audit:read',
];

const COMPANY_ADMIN_PERMISSIONS = [
  'company:read', 'company:update',
  'user:read', 'user:create', 'user:update', 'user:delete',
  'role:read', 'role:create', 'role:update', 'role:delete',
  'billing:read', 'subscription:read',
];

const MANAGER_PERMISSIONS = [
  'company:read',
  'user:read', 'user:create', 'user:update',
  'role:read',
];

const BILLING_MANAGER_PERMISSIONS = [
  'company:read',
  'billing:read', 'billing:manage',
  'subscription:read', 'subscription:manage',
];

const HR_MANAGER_PERMISSIONS = [
  'company:read',
  'user:read', 'user:create', 'user:update', 'user:delete',
  'role:read',
];

const AUDITOR_PERMISSIONS = [
  'company:read',
  'user:read',
  'audit:read',
];

const VIEWER_PERMISSIONS = [
  'company:read',
  'user:read',
];

const STANDARD_USER_PERMISSIONS = [
  'company:read',
  'user:read',
];

// ─── SaaS Pricing Plans ──────────────────────────────────────────────────────
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
  console.log('[Seed] Connected to MongoDB');

  // 1. Seed SaaS Plans
  for (const planData of PLANS) {
    const exists = await Plan.findOne({ name: planData.name });
    if (!exists) {
      await Plan.create(planData);
      console.log(`[Seed] Created plan: ${planData.displayName}`);
    }
  }

  // 2. Super Admin Role (system-level, tenantId = null)
  let superAdminRole = await Role.findOne({ name: 'super_admin', isSystemRole: true });
  if (!superAdminRole) {
    superAdminRole = await Role.create({
      tenantId: null,
      name: 'super_admin',
      permissions: SUPER_ADMIN_PERMISSIONS,
      isSystemRole: true,
    });
    console.log('[Seed] Created super_admin role');
  }

  // 3. Company Admin Role (system-level default template)
  let companyAdminRole = await Role.findOne({ name: 'company_admin', isSystemRole: true });
  if (!companyAdminRole) {
    companyAdminRole = await Role.create({
      tenantId: null,
      name: 'company_admin',
      permissions: COMPANY_ADMIN_PERMISSIONS,
      isSystemRole: true,
    });
    console.log('[Seed] Created company_admin role');
  }

  // 4. Expanded System Roles
  const expandedRoles = [
    { name: 'manager',         permissions: MANAGER_PERMISSIONS,         description: 'Team manager with user oversight' },
    { name: 'billing_manager', permissions: BILLING_MANAGER_PERMISSIONS, description: 'Manages billing and subscriptions' },
    { name: 'hr_manager',      permissions: HR_MANAGER_PERMISSIONS,      description: 'Human resources — full user management' },
    { name: 'auditor',         permissions: AUDITOR_PERMISSIONS,         description: 'Read-only access to audit logs and reports' },
    { name: 'viewer',          permissions: VIEWER_PERMISSIONS,          description: 'View-only access to company and users' },
  ];
  for (const r of expandedRoles) {
    const exists = await Role.findOne({ name: r.name, isSystemRole: true });
    if (!exists) {
      await Role.create({ tenantId: null, name: r.name, permissions: r.permissions, isSystemRole: true });
      console.log(`[Seed] Created role: ${r.name}`);
    }
  }

  // 5. Super Admin User
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@platform.com';
  let superAdminUser = await User.findOne({ email: superAdminEmail });
  if (!superAdminUser) {
    superAdminUser = await User.create({
      tenantId: null,
      name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
      email: superAdminEmail,
      password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@1234',
      roleId: superAdminRole._id,
      isActive: true,
    });
    console.log(`[Seed] Created Super Admin user: ${superAdminEmail}`);
  }

  // 4. Demo Tenant A: "Acme Technologies" (In 7-day Free Trial)
  let tenantA = await Tenant.findOne({ email: 'contact@acme.com' });
  const trialStart = new Date();
  const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  if (!tenantA) {
    tenantA = await Tenant.create({
      name: 'Acme Technologies Inc.',
      email: 'contact@acme.com',
      phone: '+91 98765 43210',
      address: '100 Innovation Blvd, Tech Hub',
      gst: '27AABCU9603R1ZM',
      license: 'REG-ACME-2026',
      status: 'TRIAL',
      trialStartedAt: trialStart,
      trialEndsAt: trialEnd,
    });
    console.log('[Seed] Created Tenant: Acme Technologies Inc. (TRIAL)');
  }

  // 5. Acme Company Admin User
  let acmeAdmin = await User.findOne({ email: 'admin@acme.com' });
  if (!acmeAdmin) {
    acmeAdmin = await User.create({
      tenantId: tenantA._id,
      name: 'Sarah Connor (Company Admin)',
      email: 'admin@acme.com',
      password: 'Password@123',
      roleId: companyAdminRole._id,
      isActive: true,
    });
    console.log('[Seed] Created Acme Admin: admin@acme.com (Password: Password@123)');
  }

  // 6. Custom Role in Acme: "Team Member / Viewer"
  let memberRole = await Role.findOne({ tenantId: tenantA._id, name: 'Team Member' });
  if (!memberRole) {
    memberRole = await Role.create({
      tenantId: tenantA._id,
      name: 'Team Member',
      permissions: STANDARD_USER_PERMISSIONS,
      isSystemRole: false,
    });
    console.log('[Seed] Created Acme Custom Role: Team Member');
  }

  // 7. Acme Regular Standard User
  let acmeUser = await User.findOne({ email: 'user@acme.com' });
  if (!acmeUser) {
    acmeUser = await User.create({
      tenantId: tenantA._id,
      name: 'John Doe (Regular User)',
      email: 'user@acme.com',
      password: 'Password@123',
      roleId: memberRole._id,
      isActive: true,
    });
    console.log('[Seed] Created Acme User: user@acme.com (Password: Password@123)');
  }

  // 8. Demo Tenant B: "Nexus Digital" (Active Subscribed)
  let tenantB = await Tenant.findOne({ email: 'contact@nexus.com' });
  if (!tenantB) {
    tenantB = await Tenant.create({
      name: 'Nexus Digital Labs',
      email: 'contact@nexus.com',
      phone: '+91 91234 56789',
      address: '42 Cyber City, Sector 5',
      gst: '07AAACN0123E1Z4',
      license: 'REG-NEXUS-2026',
      status: 'ACTIVE',
      trialStartedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      trialEndsAt: new Date(Date.now() - 23 * 24 * 60 * 60 * 1000),
    });
    console.log('[Seed] Created Tenant: Nexus Digital Labs (ACTIVE)');
  }

  // 9. Nexus Company Admin
  let nexusAdmin = await User.findOne({ email: 'admin@nexus.com' });
  if (!nexusAdmin) {
    nexusAdmin = await User.create({
      tenantId: tenantB._id,
      name: 'Elena Rostova (Nexus Admin)',
      email: 'admin@nexus.com',
      password: 'Password@123',
      roleId: companyAdminRole._id,
      isActive: true,
    });
    console.log('[Seed] Created Nexus Admin: admin@nexus.com (Password: Password@123)');
  }

  await mongoose.disconnect();
  console.log('\n=============================================');
  console.log(' SEED COMPLETE — READY-TO-USE DEMO ACCOUNTS');
  console.log('=============================================');
  console.log('1. Super Admin:');
  console.log('   Email:    admin@platform.com');
  console.log('   Password: Admin@1234');
  console.log('   Access:   Cross-tenant directory & Super Admin KPIs\n');
  console.log('2. Company Admin (Acme Technologies):');
  console.log('   Email:    admin@acme.com');
  console.log('   Password: Password@123');
  console.log('   Access:   Manage own company, trial, invite members & roles\n');
  console.log('3. Regular User (Acme Technologies):');
  console.log('   Email:    user@acme.com');
  console.log('   Password: Password@123');
  console.log('   Access:   Standard team member restricted access\n');
  console.log('4. Company Admin (Nexus Digital - Active Tenant):');
  console.log('   Email:    admin@nexus.com');
  console.log('   Password: Password@123');
  console.log('   Access:   Active subscribed company profile\n');
  console.log('=============================================\n');

  process.exit(0);
}

seed().catch((err) => {
  console.error('[Seed] Error:', err.message);
  process.exit(1);
});

