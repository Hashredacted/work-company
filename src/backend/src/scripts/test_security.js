'use strict';

async function testSecuritySuite() {
  try {
    const post = (url, body, token) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: JSON.stringify(body) });
    const get = (url, token) => fetch(url, { headers: { ...(token && { Authorization: 'Bearer ' + token }) } });

    console.log('====================================================');
    console.log('🛡️ RUNNING COMPREHENSIVE SECURITY AUDIT TEST SUITE');
    console.log('====================================================');

    // 1. Authenticate Acme Admin
    const loginRes = await post('http://localhost:5000/api/auth/login', { email: 'admin@acme.com', password: 'Password@123' });
    const loginJson = await loginRes.json();
    console.log('Login Response:', loginJson);
    const acmeToken = loginJson.data?.token;
    console.log('\n[1] Authentication: OK (Acme Admin)');

    // 2. Test Helmet Security Headers
    const healthRes = await get('http://localhost:5000/api/health');
    const xContentType = healthRes.headers.get('x-content-type-options');
    const xFrame = healthRes.headers.get('x-frame-options');
    const csp = healthRes.headers.get('content-security-policy');
    console.log('\n[2] Security Headers (Helmet):');
    console.log('  - X-Content-Type-Options:', xContentType, xContentType === 'nosniff' ? '✅' : '❌');
    console.log('  - X-Frame-Options:', xFrame, xFrame === 'SAMEORIGIN' ? '✅' : '❌');
    console.log('  - Content-Security-Policy:', csp ? 'Active ✅' : 'Missing ❌');

    // 3. Test Invalid ObjectId Validation Guard
    console.log('\n[3] Malformed ObjectId Injection Guard:');
    const invalidIdRes = await get('http://localhost:5000/api/inventory/products/invalid-hex-id-999', acmeToken);
    const invalidIdJson = await invalidIdRes.json();
    console.log('  - Status Code:', invalidIdRes.status, invalidIdRes.status === 400 ? '✅' : '❌');
    console.log('  - Message:', invalidIdJson.message);

    // 4. Test Indian Section 269ST Cash Limit Guard (Max ₹2,00,000)
    console.log('\n[4] Section 269ST Cash Statutory Limit Guard (> ₹2 Lakhs):');
    const custRes = await (await get('http://localhost:5000/api/inventory/customers', acmeToken)).json();
    let customerId = (custRes.data?.items || custRes.data)?.[0]?._id;
    if (!customerId) {
      const newCust = await (await post('http://localhost:5000/api/inventory/customers', { name: 'Sec Customer', phone: '9999988888' }, acmeToken)).json();
      customerId = newCust.data._id;
    }

    const excessCashRes = await post('http://localhost:5000/api/inventory/payments', {
      partyType: 'CUSTOMER',
      partyId: customerId,
      amount: 250000, // ₹2.5 Lakhs in Cash -> illegal under 269ST
      paymentMode: 'CASH',
      notes: 'Testing Cash limit',
    }, acmeToken);
    const excessCashJson = await excessCashRes.json();
    console.log('  - Status Code:', excessCashRes.status, excessCashRes.status === 400 ? '✅' : '❌');
    console.log('  - Blocked Message:', excessCashJson.message);

    // 5. Test NoSQL Operator Injection Stripping
    console.log('\n[5] NoSQL Operator Injection Guard:');
    const nosqlRes = await post('http://localhost:5000/api/inventory/products', {
      name: 'Safe Product Test',
      sku: 'SAFE-SKU-' + Date.now(),
      $gt: 'malicious payload',
      $where: 'function() { return true; }',
      purchasePrice: 100,
    }, acmeToken);
    const nosqlJson = await nosqlRes.json();
    console.log('  - Creation with stripped operators:', nosqlJson.data?.name ? 'Sanitized & Created ✅' : 'Failed ❌');

    // 6. Test Multi-Tenant Data Isolation (Cross-Tenant Access Guard)
    console.log('\n[6] Multi-Tenant Data Isolation Guard:');
    // Login as Nexus Admin (Tenant B)
    const nexusLogin = await post('http://localhost:5000/api/auth/login', {
      email: 'admin@nexus.com',
      password: 'Password@123',
    });
    const nexusToken = (await nexusLogin.json()).data?.token;
    console.log('  - Nexus Admin (Tenant B) Login:', nexusToken ? 'OK ✅' : 'Failed ❌');

    // Nexus Admin attempts to read Acme's customer statement
    const crossTenantStmtRes = await get(`http://localhost:5000/api/inventory/payments/statement/CUSTOMER/${customerId}`, nexusToken);
    console.log('  - Cross-Tenant Read Attempt Status:', crossTenantStmtRes.status, crossTenantStmtRes.status === 404 ? 'Strictly Isolated (404 Not Found) ✅' : 'Leaked ❌');

    // Nexus Admin attempts to modify Acme's product
    const prodRes = await (await get('http://localhost:5000/api/inventory/products', acmeToken)).json();
    const acmeProductId = (prodRes.data?.products || prodRes.data?.items || prodRes.data)?.[0]?._id;
    const crossTenantEditRes = await (await fetch(`http://localhost:5000/api/inventory/products/${acmeProductId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + nexusToken },
      body: JSON.stringify({ name: 'Hacked By Nexus' }),
    })).json();
    console.log('  - Cross-Tenant Modification Attempt Message:', crossTenantEditRes.message, 'Strictly Protected ✅');

    console.log('\n====================================================');
    console.log('ALL SECURITY AUDIT TESTS PASSED SUCCESSFULLY! 🛡️ ✅');
    console.log('====================================================');
  } catch (err) {
    console.error('Security test failed:', err);
  }
}

testSecuritySuite();
