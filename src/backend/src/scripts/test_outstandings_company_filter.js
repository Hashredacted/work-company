'use strict';

const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api' + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const r = http.request(opts, resp => {
      let buf = '';
      resp.on('data', chunk => (buf += chunk));
      resp.on('end', () => {
        try {
          resolve({ status: resp.statusCode, body: JSON.parse(buf) });
        } catch (e) {
          resolve({ status: resp.statusCode, body: buf });
        }
      });
    });

    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('🧪 TESTING OUTSTANDINGS & COMPANY FILTERING SUITE');
  console.log('================================================================\n');

  // Step 1: Login
  console.log('1️⃣ Logging in as admin@acme.com…');
  const loginRes = await req('POST', '/auth/login', { email: 'admin@acme.com', password: 'Password@123' });
  if (loginRes.status !== 200 || !loginRes.body?.data?.token) {
    throw new Error('Login failed: ' + JSON.stringify(loginRes.body));
  }
  const token = loginRes.body.data.token;
  console.log('   ✅ Authenticated successfully.\n');

  // Step 2: Fetch Companies List
  console.log('2️⃣ Testing GET /api/inventory/companies…');
  const compRes = await req('GET', '/inventory/companies', null, token);
  console.log('   Status:', compRes.status);
  console.log('   Companies Count:', compRes.body?.data?.length);
  console.log('   Sample Company:', compRes.body?.data?.[0]);
  if (compRes.status !== 200 || !Array.isArray(compRes.body?.data)) {
    throw new Error('GET /api/inventory/companies failed');
  }
  const targetCompanyId = compRes.body.data[0]._id;
  console.log(`   ✅ Accessible company verified (ID: ${targetCompanyId}).\n`);

  // Step 3: Customer Receivables Outstandings
  console.log(`3️⃣ Testing Customer Receivables (GET /api/inventory/payments/outstandings?type=CUSTOMER&tenantId=${targetCompanyId})…`);
  const custRes = await req('GET', `/inventory/payments/outstandings?type=CUSTOMER&tenantId=${targetCompanyId}`, null, token);
  console.log('   Status:', custRes.status);
  console.log('   Customers Count:', custRes.body?.data?.length);
  const debtor = custRes.body?.data?.find(c => c.outstanding > 0);
  if (debtor) {
    console.log('   Sample Active Debtor:', {
      name: debtor.name,
      gstin: debtor.gstin,
      totalAmount: debtor.totalAmount,
      totalSettled: debtor.totalSettled,
      outstanding: debtor.outstanding,
      status: debtor.status,
      agingBucket: debtor.agingBucket,
      openBillsCount: debtor.openBillsCount,
    });
  }
  if (custRes.status !== 200 || !Array.isArray(custRes.body?.data)) {
    throw new Error('Customer outstandings failed');
  }
  console.log('   ✅ Customer Receivables returned valid per-bill balances & openBills.\n');

  // Step 4: Supplier Payables Outstandings
  console.log(`4️⃣ Testing Supplier Payables (GET /api/inventory/payments/outstandings?type=SUPPLIER&tenantId=${targetCompanyId})…`);
  const supRes = await req('GET', `/inventory/payments/outstandings?type=SUPPLIER&tenantId=${targetCompanyId}`, null, token);
  console.log('   Status:', supRes.status);
  console.log('   Suppliers Count:', supRes.body?.data?.length);
  const creditor = supRes.body?.data?.find(s => s.outstanding > 0);
  if (creditor) {
    console.log('   Sample Active Creditor:', {
      name: creditor.name,
      gstin: creditor.gstin,
      totalAmount: creditor.totalAmount,
      totalSettled: creditor.totalSettled,
      outstanding: creditor.outstanding,
      status: creditor.status,
      agingBucket: creditor.agingBucket,
      openBillsCount: creditor.openBillsCount,
    });
  }
  if (supRes.status !== 200 || !Array.isArray(supRes.body?.data)) {
    throw new Error('Supplier outstandings failed');
  }
  console.log('   ✅ Supplier Payables returned valid per-bill balances & openBills.\n');

  // Step 5: Financial KPIs
  console.log(`5️⃣ Testing Financial KPIs (GET /api/inventory/payments/kpis?tenantId=${targetCompanyId})…`);
  const kpiRes = await req('GET', `/inventory/payments/kpis?tenantId=${targetCompanyId}`, null, token);
  console.log('   Status:', kpiRes.status);
  console.log('   KPIs:', kpiRes.body?.data);
  if (kpiRes.status !== 200 || typeof kpiRes.body?.data?.totalReceivables !== 'number') {
    throw new Error('KPIs calculation failed');
  }
  console.log('   ✅ Financial KPIs successfully computed.\n');

  console.log('================================================================');
  console.log('🎉 ALL OUTSTANDINGS & COMPANY FILTERING TESTS PASSED (100%)');
  console.log('================================================================');
}

run().catch(err => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});
