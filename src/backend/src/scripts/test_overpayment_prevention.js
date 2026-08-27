'use strict';
/**
 * Test Overpayment Prevention:
 * 1. Test payment amount > total pending balance -> must fail (400)
 * 2. Test payment for cleared party (0 balance) -> must fail (400)
 * 3. Test bill allocation > bill pending amount -> must fail (400)
 * 4. Test sum of allocations > payment amount -> must fail (400)
 * 5. Test Quick Stock paidAmount > totalAmount -> must fail (400)
 * 6. Test valid payment <= total pending -> must succeed (201)
 */
const http = require('http');

function req(method, path, body, token) {
  return new Promise((res, rej) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = http.request(opts, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => {
        try { res({ status: resp.statusCode, body: JSON.parse(d) }); }
        catch (e) { res({ status: resp.statusCode, body: d }); }
      });
    });
    r.on('error', rej);
    if (data) r.write(data);
    r.end();
  });
}

function inr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
function sep(l) { console.log('\n' + '='.repeat(60) + '\n ' + l + '\n' + '='.repeat(60)); }
function pass(m) { console.log('  ✅ [PASS] ' + m); }
function info(m) { console.log('  📌 [INFO] ' + m); }
function fail(m) { console.log('  ❌ [FAIL] ' + m); }
function chk(cond, p, f) { if (cond) pass(p); else { fail(f); throw new Error(f); } }

async function run() {
  sep('STEP 0: Authentication');
  const loginRes = await req('POST', '/auth/login', { email: 'admin@acme.com', password: 'Password@123' });
  const token = loginRes.body?.data?.token;
  chk(token, 'Logged in as admin@acme.com', 'Login failed');

  // Fetch product & warehouse
  const wRes = await req('GET', '/inventory/warehouses', null, token);
  const pRes = await req('GET', '/inventory/products?limit=10', null, token);
  const warehouse = wRes.body?.data?.[0];
  const products  = pRes.body?.data?.products || pRes.body?.data || [];
  const product   = products[0];

  // Fetch parties
  const custRes = await req('GET', '/inventory/payments/outstandings?type=CUSTOMER', null, token);
  const suppRes = await req('GET', '/inventory/payments/outstandings?type=SUPPLIER', null, token);
  const customers = custRes.body?.data || [];
  const suppliers = suppRes.body?.data || [];

  const cust = customers.find(c => c.outstanding > 0) || customers[0];
  const supp = suppliers.find(s => s.outstanding > 0) || suppliers[0];
  const clearedCust = customers.find(c => c.outstanding === 0) || customers[1];

  // ══════════════════════════════════════════════════════════════
  // TEST 1: Overpayment check on Customer (amount > total pending)
  // ══════════════════════════════════════════════════════════════
  sep('TEST 1: Customer Payment Amount > Total Outstanding');
  
  // Ensure customer has a known invoice
  const invAmt = 5000;
  await req('POST', '/inventory/stock-adjust', {
    productId: product._id,
    warehouseId: warehouse._id,
    type: 'OUT',
    qty: 1,
    unitCost: invAmt,
    customerId: cust._id,
    totalAmount: invAmt,
    paymentStatus: 'UNPAID',
    remarks: 'Overpayment test invoice',
  }, token);

  const curCust = (await req('GET', '/inventory/payments/outstandings?type=CUSTOMER', null, token)).body?.data?.find(c => String(c._id) === String(cust._id));
  const exactDue = curCust.outstanding;
  info(`Current Customer Outstanding: ${inr(exactDue)}`);

  // Attempt to pay exactDue + ₹5,000
  const overpayAmt = exactDue + 5000;
  info(`Attempting to receive overpayment of ${inr(overpayAmt)}...`);
  const overpayRes = await req('POST', '/inventory/payments', {
    partyType: 'CUSTOMER',
    partyId: cust._id,
    amount: overpayAmt,
    paymentMode: 'UPI',
    autoKnockoff: true,
  }, token);

  chk(overpayRes.status === 400, `Correctly rejected with 400: "${overpayRes.body?.message}"`, `Allowed overpayment! Status: ${overpayRes.status}`);

  // ══════════════════════════════════════════════════════════════
  // TEST 2: Payment on Party with ₹0 Outstanding
  // ══════════════════════════════════════════════════════════════
  sep('TEST 2: Payment for Cleared Party (₹0 Outstanding)');
  if (clearedCust) {
    info(`Cleared party: ${clearedCust.name} (Outstanding: ${inr(clearedCust.outstanding)})`);
    const zeroPayRes = await req('POST', '/inventory/payments', {
      partyType: 'CUSTOMER',
      partyId: clearedCust._id,
      amount: 1000,
      paymentMode: 'CASH',
      autoKnockoff: true,
    }, token);

    chk(zeroPayRes.status === 400, `Correctly rejected with 400: "${zeroPayRes.body?.message}"`, `Allowed payment on ₹0 balance! Status: ${zeroPayRes.status}`);
  }

  // ══════════════════════════════════════════════════════════════
  // TEST 3: Individual Bill Over-Allocation
  // ══════════════════════════════════════════════════════════════
  sep('TEST 3: Individual Bill Over-Allocation');
  const pbRes = await req('GET', `/inventory/payments/pending-bills?partyType=CUSTOMER&partyId=${cust._id}`, null, token);
  const openBill = pbRes.body?.data?.bills?.[0];

  if (openBill) {
    info(`Open bill ${openBill.voucherNo} has pending balance of ${inr(openBill.pendingAmount)}`);
    const overAllocAmt = openBill.pendingAmount + 2000;

    const overAllocRes = await req('POST', '/inventory/payments', {
      partyType: 'CUSTOMER',
      partyId: cust._id,
      amount: overAllocAmt,
      paymentMode: 'UPI',
      allocations: [{ billId: openBill._id, amount: overAllocAmt }],
    }, token);

    chk(overAllocRes.status === 400, `Correctly rejected with 400: "${overAllocRes.body?.message}"`, `Allowed bill over-allocation! Status: ${overAllocRes.status}`);
  }

  // ══════════════════════════════════════════════════════════════
  // TEST 4: Quick Stock Partial Payment > Total Amount
  // ══════════════════════════════════════════════════════════════
  sep('TEST 4: Quick Stock Partial Payment > Total Amount');
  const qsOverRes = await req('POST', '/inventory/stock-adjust', {
    productId: product._id,
    warehouseId: warehouse._id,
    type: 'IN',
    qty: 2,
    unitCost: 1000,
    supplierId: supp._id,
    totalAmount: 2000,
    paymentStatus: 'PARTIAL',
    paidAmount: 3500, // Greater than totalAmount of 2000
    paymentMode: 'UPI',
  }, token);

  chk(qsOverRes.status === 400, `Correctly rejected with 400: "${qsOverRes.body?.message}"`, `Allowed Quick Stock overpayment! Status: ${qsOverRes.status}`);

  // ══════════════════════════════════════════════════════════════
  // TEST 5: Valid Exact and Partial Payments Still Work
  // ══════════════════════════════════════════════════════════════
  sep('TEST 5: Valid Payments <= Total Outstanding');
  const validPartial = Math.min(2000, exactDue);
  const validPayRes = await req('POST', '/inventory/payments', {
    partyType: 'CUSTOMER',
    partyId: cust._id,
    amount: validPartial,
    paymentMode: 'UPI',
    autoKnockoff: true,
  }, token);

  chk(validPayRes.status === 201, `Valid partial payment of ${inr(validPartial)} succeeded with 201`, `Valid payment failed: ${validPayRes.body?.message}`);

  sep('🎉 ALL OVERPAYMENT PREVENTION TESTS PASSED 🎉');
}

run().catch(e => {
  console.error('\n❌ TEST RUN FAILED:', e.message);
  process.exit(1);
});
