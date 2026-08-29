'use strict';

/**
 * End-to-End Registration & Sign-Up Test Suite
 * Tests company registration, 7-day trial creation, RBAC provisioning,
 * warehouse & category presets, subscription linkage, duplicate handling,
 * and session authentication.
 *
 * Run with: node src/scripts/test_registration.js
 */

const API_BASE = 'http://localhost:5000/api';

async function runRegistrationTests() {
  console.log('====================================================');
  console.log('🏢 RUNNING COMPANY REGISTRATION & SIGN UP TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${details ? '— ' + details : ''}`);
      failed++;
    }
  }

  const post = async (url, body, token) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, json, ok: res.ok };
  };

  const get = async (url, token) => {
    const res = await fetch(url, {
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
    const json = await res.json();
    return { status: res.status, json, ok: res.ok };
  };

  const rand = Math.floor(100000 + Math.random() * 900000);
  const testCompanyPayload = {
    name:         `Apex Retail Test ${rand} Ltd`,
    email:        `contact_${rand}@apexretailtest.in`,
    phone:        `+91 98201 ${rand % 100000}`,
    businessType: 'Retail & Wholesale',
    gst:          '27AABCA1234F1Z5',
    license:      `REG-APEX-${rand}`,
    address:      'Plot 45, Commercial Complex, Andheri East',
    city:         'Mumbai',
    state:        'Maharashtra',
    stateCode:    '27',
    pincode:      '400001',
    adminName:    `Rohan Sharma ${rand}`,
    adminEmail:   `admin_${rand}@apexretailtest.in`,
    adminPassword: 'Password@123',
  };

  try {
    // ─── TEST 1: Register New Company (POST /api/companies/register) ─────────
    console.log('[1] Testing Company Registration (7-Day Trial Onboarding)...');
    const regRes = await post(`${API_BASE}/companies/register`, testCompanyPayload);
    assert(regRes.status === 201, 'Registration returns HTTP 201 Created', `Got ${regRes.status}: ${JSON.stringify(regRes.json)}`);
    assert(regRes.json.data && regRes.json.data.token, 'Registration returns JWT auth token');

    const { token, user, tenant } = regRes.json.data || {};
    assert(tenant && tenant.name === testCompanyPayload.name, 'Tenant name matches input');
    assert(tenant && tenant.status === 'TRIAL', 'Tenant status is initialized to TRIAL');
    assert(tenant && tenant.daysRemainingInTrial === 7, 'Tenant gets exactly 7 days free trial');
    assert(tenant && tenant.city === 'Mumbai' && tenant.state === 'Maharashtra', 'Tenant Indian address metadata saved');
    assert(tenant && tenant.plan && tenant.plan.name, 'Tenant is linked to SaaS Plan tier');
    assert(user && user.email === testCompanyPayload.adminEmail.toLowerCase(), 'Admin user account created');
    assert(user && user.role && user.role.name === 'company_admin', 'Admin user assigned company_admin role');

    // ─── TEST 2: Authenticate with newly registered Admin User ────────────────
    console.log('\n[2] Testing Authentication with New Admin Credentials...');
    const loginRes = await post(`${API_BASE}/auth/login`, {
      email: testCompanyPayload.adminEmail,
      password: testCompanyPayload.adminPassword,
    });
    assert(loginRes.status === 200, 'Login with exact admin email returns HTTP 200 OK');
    assert(loginRes.json.data && loginRes.json.data.token, 'Login returns valid token');
    const userToken = loginRes.json.data.token;

    // ─── TEST 2B: Case-Insensitive Email Login Test ───────────────────────────
    console.log('\n[2B] Testing Case-Insensitive & Whitespace Email Login...');
    const upperEmailRes = await post(`${API_BASE}/auth/login`, {
      email: `  ${testCompanyPayload.adminEmail.toUpperCase()}  `,
      password: testCompanyPayload.adminPassword,
    });
    assert(upperEmailRes.status === 200, 'Login with uppercase and padded email returns HTTP 200 OK');

    // ─── TEST 2C: Company Email Fallback Login Test ───────────────────────────
    console.log('\n[2C] Testing Company Contact Email Fallback Login...');
    const compEmailRes = await post(`${API_BASE}/auth/login`, {
      email: testCompanyPayload.email,
      password: testCompanyPayload.adminPassword,
    });
    assert(compEmailRes.status === 200, 'Login with company contact email returns HTTP 200 OK');

    // ─── TEST 3: Access Protected Tenant Profile (GET /api/companies/me) ──────
    console.log('\n[3] Testing Tenant Profile & Trial Verification (GET /api/companies/me)...');
    const meCompRes = await get(`${API_BASE}/companies/me`, userToken);
    assert(meCompRes.status === 200, 'GET /api/companies/me returns HTTP 200 OK');
    assert(meCompRes.json.data.status === 'TRIAL', 'Current tenant status is TRIAL');
    assert(meCompRes.json.data.daysRemainingInTrial === 7, 'Days remaining in trial is 7');

    // ─── TEST 4: Verify Subscription Linkage (GET /api/billing/subscription) ──
    console.log('\n[4] Testing Active Trial Subscription (GET /api/billing/subscription)...');
    const subRes = await get(`${API_BASE}/billing/subscription`, userToken);
    assert(subRes.status === 200, 'GET /api/billing/subscription returns HTTP 200 OK');
    assert(subRes.json.data.subscription && subRes.json.data.subscription.status === 'TRIALING', 'Subscription is in TRIALING state');

    // ─── TEST 5: Verify Auto-Provisioned Central Godown ───────────────────────
    console.log('\n[5] Testing Auto-Provisioned Central Godown (GET /api/inventory/warehouses)...');
    const whRes = await get(`${API_BASE}/inventory/warehouses`, userToken);
    assert(whRes.status === 200, 'GET /api/inventory/warehouses returns HTTP 200 OK');
    const warehouses = whRes.json.data || [];
    assert(warehouses.length >= 1, 'Default warehouse was created for new tenant');
    const defaultWh = warehouses.find(w => w.isDefault);
    assert(defaultWh && defaultWh.name === 'Main Godown', 'Default warehouse name is "Main Godown"');
    assert(defaultWh && defaultWh.city === 'Mumbai', 'Default warehouse city matches company city');

    // ─── TEST 6: Verify Auto-Seeded Category Presets ──────────────────────────
    console.log('\n[6] Testing Auto-Seeded Indian Category Presets (GET /api/inventory/categories)...');
    const catRes = await get(`${API_BASE}/inventory/categories`, userToken);
    assert(catRes.status === 200, 'GET /api/inventory/categories returns HTTP 200 OK');
    const categories = catRes.json.data || [];
    assert(categories.length >= 4, `Indian category hierarchy seeded (${categories.length} categories found)`);

    // ─── TEST 7: Duplicate Company Email Conflict (409) ──────────────────────
    console.log('\n[7] Testing Duplicate Company Email Conflict Rejection...');
    const dupCompanyRes = await post(`${API_BASE}/companies/register`, {
      ...testCompanyPayload,
      adminEmail: `other_admin_${rand}@apexretailtest.in`,
    });
    assert(dupCompanyRes.status === 409, 'Duplicate company email rejected with HTTP 409 Conflict');
    assert(dupCompanyRes.json.errors && dupCompanyRes.json.errors.email, 'Error specifies company email conflict');

    // ─── TEST 8: Duplicate Admin Email Conflict (409) ────────────────────────
    console.log('\n[8] Testing Duplicate Admin User Email Conflict Rejection...');
    const dupAdminRes = await post(`${API_BASE}/companies/register`, {
      ...testCompanyPayload,
      email: `other_company_${rand}@apexretailtest.in`,
    });
    assert(dupAdminRes.status === 409, 'Duplicate admin email rejected with HTTP 409 Conflict');
    assert(dupAdminRes.json.errors && dupAdminRes.json.errors.adminEmail, 'Error specifies admin email conflict');

    // ─── TEST 9: Validation Failures (HTTP 400) ──────────────────────────────
    console.log('\n[9] Testing Validation Rejections (Missing Fields / Invalid Inputs)...');
    const invalidRes = await post(`${API_BASE}/companies/register`, {
      name: 'A', // Too short
      email: 'invalid-email',
      adminName: '',
      adminEmail: 'bad-admin-email',
      adminPassword: '123', // Too short
    });
    assert(invalidRes.status === 400, 'Invalid inputs rejected with HTTP 400 Bad Request');
    assert(invalidRes.json.errors && invalidRes.json.errors.name, 'Validation errors include company name');
    assert(invalidRes.json.errors && invalidRes.json.errors.email, 'Validation errors include company email');
    assert(invalidRes.json.errors && invalidRes.json.errors.adminPassword, 'Validation errors include password length');

    // ─── TEST 10: Auth Route Aliases (/api/auth/register & /api/auth/signup) ─
    console.log('\n[10] Testing Auth Route Aliases (/api/auth/register & /api/auth/signup)...');
    const rand2 = Math.floor(100000 + Math.random() * 900000);
    const aliasRes = await post(`${API_BASE}/auth/signup`, {
      name:         `Alias Test Company ${rand2}`,
      email:        `alias_${rand2}@example.com`,
      adminName:    `Alias Admin ${rand2}`,
      adminEmail:   `alias_admin_${rand2}@example.com`,
      adminPassword: 'Password@123',
    });
    assert(aliasRes.status === 201, 'POST /api/auth/signup alias endpoint successfully registered company');
    assert(aliasRes.json.data && aliasRes.json.data.token, 'Signup alias returned valid token');

  } catch (err) {
    console.error('\n💥 Unexpected error during test run:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRegistrationTests();
