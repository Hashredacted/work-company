'use strict';
/**
 * Test Payment Flow:
 * 1. Login
 * 2. Check Customer & Supplier Outstandings & KPIs
 * 3. Create Invoice (Stock Out on Credit) -> Verify Customer Outstanding increases
 * 4. Record Partial Payment (Receive part) -> Verify Outstanding reduces by that amount, NOT cleared!
 * 5. Record Final Payment (Receive rest) -> Verify Outstanding clears to 0!
 * 6. Create Supplier Bill (Stock In on Credit) -> Verify Supplier Payable increases
 * 7. Record Partial Payment to Supplier -> Verify Payable reduces by that amount, NOT cleared!
 * 8. Record Final Payment to Supplier -> Verify Supplier clears to 0!
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

  // Fetch initial state
  sep('STEP 1: Checking Initial State');
  const custRes = await req('GET', '/inventory/payments/outstandings?type=CUSTOMER', null, token);
  const suppRes = await req('GET', '/inventory/payments/outstandings?type=SUPPLIER', null, token);
  const kpiRes  = await req('GET', '/inventory/payments/kpis', null, token);

  const customers = custRes.body?.data || [];
  const suppliers = suppRes.body?.data || [];
  const kpis      = kpiRes.body?.data || {};

  info(`Customers loaded: ${customers.length}`);
  info(`Suppliers loaded: ${suppliers.length}`);
  info(`KPI Receivables: ${inr(kpis.totalReceivables)}, Payables: ${inr(kpis.totalPayables)}`);

  customers.slice(0, 4).forEach(c => {
    info(`Customer: ${c.name.padEnd(28)} | Outstanding: ${inr(c.outstanding).padEnd(10)} | Status: ${c.status}`);
  });

  const cust = customers[0];
  const supp = suppliers[0];
  chk(cust && supp, 'Found customer & supplier for testing', 'Missing party data');

  // Fetch product & warehouse
  const wRes = await req('GET', '/inventory/warehouses', null, token);
  const pRes = await req('GET', '/inventory/products?limit=10', null, token);
  const warehouse = wRes.body?.data?.[0];
  const products  = pRes.body?.data?.products || pRes.body?.data || [];
  const product   = products[0];
  chk(warehouse && product, `Using warehouse "${warehouse?.name}" and product "${product?.name}"`, 'Missing warehouse/product');

  // ══════════════════════════════════════════════════════════════
  // CUSTOMER FLOW: Create Invoice -> Partial Payment -> Final Clear
  // ══════════════════════════════════════════════════════════════
  sep(`PHASE 1: CUSTOMER LIFECYCLE (${cust.name})`);
  
  const initialCustOut = cust.outstanding;
  info(`Initial Outstanding: ${inr(initialCustOut)}`);

  // 1A. Create Invoice of ₹10,000 on credit
  const invoiceAmount = 10000;
  const stockOutRes = await req('POST', '/inventory/stock-adjust', {
    productId: product._id,
    warehouseId: warehouse._id,
    type: 'OUT',
    qty: 2,
    unitCost: 5000,
    customerId: cust._id,
    totalAmount: invoiceAmount,
    paymentStatus: 'UNPAID',
    remarks: 'E2E Test Invoice',
  }, token);

  chk(stockOutRes.status === 201, `Created Invoice ${stockOutRes.body?.data?.billOrInvoice?.voucherNo} for ${inr(invoiceAmount)}`, 'Failed creating invoice');
  const invVoucher = stockOutRes.body?.data?.billOrInvoice?.voucherNo;

  // Verify customer outstanding increased
  const afterInvRes = await req('GET', '/inventory/payments/outstandings?type=CUSTOMER', null, token);
  const custAfterInv = afterInvRes.body?.data?.find(c => String(c._id) === String(cust._id));
  info(`Outstanding after invoice: ${inr(custAfterInv?.outstanding)} (Expected: ${inr(initialCustOut + invoiceAmount)})`);
  chk(custAfterInv?.outstanding === initialCustOut + invoiceAmount, 'Customer outstanding accurately increased by invoice amount', 'Outstanding did NOT increase correctly');
  chk(custAfterInv?.status !== 'CLEARED', `Customer status is active: ${custAfterInv?.status} (NOT CLEARED)`, 'Customer wrongly showed CLEARED after unpaid invoice');

  // 1B. Partial Payment of ₹4,000 (Receiving from Customer)
  sep('PHASE 1B: Partial Payment (Receive ₹4,000)');
  const partialRecAmt = 4000;
  const pay1Res = await req('POST', '/inventory/payments', {
    partyType: 'CUSTOMER',
    partyId: cust._id,
    amount: partialRecAmt,
    paymentMode: 'UPI',
    referenceNo: 'UPI1234567890',
    paymentDate: new Date().toISOString().split('T')[0],
    notes: 'Partial payment 1',
    autoKnockoff: true,
  }, token);

  chk(pay1Res.status === 201, `Receipt voucher created: ${pay1Res.body?.data?.txn?.voucherNo} for ${inr(partialRecAmt)}`, 'Partial payment failed');
  const remainingExpectedAfterP1 = initialCustOut + invoiceAmount - partialRecAmt;
  info(`Post-Payment response outstanding: ${inr(pay1Res.body?.data?.partyOutstanding)}`);
  
  const afterP1Res = await req('GET', '/inventory/payments/outstandings?type=CUSTOMER', null, token);
  const custAfterP1 = afterP1Res.body?.data?.find(c => String(c._id) === String(cust._id));
  info(`Customer Outstanding in table: ${inr(custAfterP1?.outstanding)} (Expected: ${inr(remainingExpectedAfterP1)})`);
  chk(custAfterP1?.outstanding === remainingExpectedAfterP1, 'Customer outstanding accurately reduced by ₹4,000 (NOT cleared)', 'Customer outstanding mismatch after partial payment');
  chk(custAfterP1?.status !== 'CLEARED', `Status is ${custAfterP1?.status} (correctly NOT CLEARED)`, 'Customer wrongly marked CLEARED after partial payment');

  // 1C. Final Payment to Clear Remaining
  sep(`PHASE 1C: Final Settlement (Receive ${inr(remainingExpectedAfterP1)})`);
  const pay2Res = await req('POST', '/inventory/payments', {
    partyType: 'CUSTOMER',
    partyId: cust._id,
    amount: remainingExpectedAfterP1,
    paymentMode: 'NEFT_RTGS',
    referenceNo: 'HDFC99887766',
    paymentDate: new Date().toISOString().split('T')[0],
    notes: 'Final settlement payment',
    autoKnockoff: true,
  }, token);

  chk(pay2Res.status === 201, `Final receipt voucher created: ${pay2Res.body?.data?.txn?.voucherNo}`, 'Final payment failed');

  const afterP2Res = await req('GET', '/inventory/payments/outstandings?type=CUSTOMER', null, token);
  const custAfterP2 = afterP2Res.body?.data?.find(c => String(c._id) === String(cust._id));
  info(`Customer Outstanding in table: ${inr(custAfterP2?.outstanding)} | Status: ${custAfterP2?.status}`);
  chk(custAfterP2?.outstanding === 0, 'Customer outstanding is exactly ₹0', 'Customer still has balance after full clearance');
  chk(custAfterP2?.status === 'CLEARED', 'Customer status is now CLEARED ✅', 'Customer status should be CLEARED');

  // ══════════════════════════════════════════════════════════════
  // SUPPLIER FLOW: Create Bill -> Partial Payment -> Final Clear
  // ══════════════════════════════════════════════════════════════
  sep(`PHASE 2: SUPPLIER LIFECYCLE (${supp.name})`);
  
  const initialSuppOut = supp.outstanding;
  info(`Initial Supplier Payable: ${inr(initialSuppOut)}`);

  // 2A. Create Supplier Bill of ₹15,000 on credit
  const billAmount = 15000;
  const stockInRes = await req('POST', '/inventory/stock-adjust', {
    productId: product._id,
    warehouseId: warehouse._id,
    type: 'IN',
    qty: 15,
    unitCost: 1000,
    supplierId: supp._id,
    totalAmount: billAmount,
    paymentStatus: 'UNPAID',
    remarks: 'E2E Test Supplier Bill',
  }, token);

  chk(stockInRes.status === 201, `Created Bill ${stockInRes.body?.data?.billOrInvoice?.voucherNo} for ${inr(billAmount)}`, 'Failed creating supplier bill');

  // Verify supplier payable increased
  const afterBillRes = await req('GET', '/inventory/payments/outstandings?type=SUPPLIER', null, token);
  const suppAfterBill = afterBillRes.body?.data?.find(s => String(s._id) === String(supp._id));
  info(`Payable after bill: ${inr(suppAfterBill?.outstanding)} (Expected: ${inr(initialSuppOut + billAmount)})`);
  chk(suppAfterBill?.outstanding === initialSuppOut + billAmount, 'Supplier payable accurately increased by bill amount', 'Supplier payable did NOT increase correctly');
  chk(suppAfterBill?.status !== 'CLEARED', `Supplier status is active: ${suppAfterBill?.status} (NOT CLEARED)`, 'Supplier wrongly showed CLEARED');

  // 2B. Partial Payment of ₹6,000 (Paying Supplier)
  sep('PHASE 2B: Partial Payment to Supplier (Pay ₹6,000)');
  const partialPayAmt = 6000;
  const spay1Res = await req('POST', '/inventory/payments', {
    partyType: 'SUPPLIER',
    partyId: supp._id,
    amount: partialPayAmt,
    paymentMode: 'NEFT_RTGS',
    referenceNo: 'HDFC11223344',
    paymentDate: new Date().toISOString().split('T')[0],
    notes: 'Partial supplier payment 1',
    autoKnockoff: true,
  }, token);

  chk(spay1Res.status === 201, `Payment voucher created: ${spay1Res.body?.data?.txn?.voucherNo} for ${inr(partialPayAmt)}`, 'Supplier partial payment failed');
  const suppRemainingExpectedAfterP1 = initialSuppOut + billAmount - partialPayAmt;

  const afterSP1Res = await req('GET', '/inventory/payments/outstandings?type=SUPPLIER', null, token);
  const suppAfterSP1 = afterSP1Res.body?.data?.find(s => String(s._id) === String(supp._id));
  info(`Supplier Payable in table: ${inr(suppAfterSP1?.outstanding)} (Expected: ${inr(suppRemainingExpectedAfterP1)})`);
  chk(suppAfterSP1?.outstanding === suppRemainingExpectedAfterP1, 'Supplier payable accurately reduced by ₹6,000 (NOT cleared)', 'Supplier payable mismatch');
  chk(suppAfterSP1?.status !== 'CLEARED', `Status is ${suppAfterSP1?.status} (correctly NOT CLEARED)`, 'Supplier wrongly marked CLEARED');

  // 2C. Final Payment to Clear Remaining
  sep(`PHASE 2C: Final Supplier Settlement (Pay ${inr(suppRemainingExpectedAfterP1)})`);
  const spay2Res = await req('POST', '/inventory/payments', {
    partyType: 'SUPPLIER',
    partyId: supp._id,
    amount: suppRemainingExpectedAfterP1,
    paymentMode: 'CHEQUE',
    referenceNo: 'CHQ-556677',
    paymentDate: new Date().toISOString().split('T')[0],
    notes: 'Final supplier settlement payment',
    autoKnockoff: true,
  }, token);

  chk(spay2Res.status === 201, `Final payment voucher created: ${spay2Res.body?.data?.txn?.voucherNo}`, 'Final supplier payment failed');

  const afterSP2Res = await req('GET', '/inventory/payments/outstandings?type=SUPPLIER', null, token);
  const suppAfterSP2 = afterSP2Res.body?.data?.find(s => String(s._id) === String(supp._id));
  info(`Supplier Payable in table: ${inr(suppAfterSP2?.outstanding)} | Status: ${suppAfterSP2?.status}`);
  chk(suppAfterSP2?.outstanding === 0, 'Supplier payable is exactly ₹0', 'Supplier still has balance after full clearance');
  chk(suppAfterSP2?.status === 'CLEARED', 'Supplier status is now CLEARED ✅', 'Supplier status should be CLEARED');

  // ══════════════════════════════════════════════════════════════
  // Final Verification of Statement & KPIs
  // ══════════════════════════════════════════════════════════════
  sep('PHASE 3: Statement & KPI Verification');
  const finalKpiRes = await req('GET', '/inventory/payments/kpis', null, token);
  const finalKpis   = finalKpiRes.body?.data || {};
  info(`Final Receivables: ${inr(finalKpis.totalReceivables)} | Payables: ${inr(finalKpis.totalPayables)} | Net Working Capital: ${inr(finalKpis.netWorkingCapital)}`);

  sep('🎉 ALL TESTS PASSED SUCCESSFULLY 🎉');
}

run().catch(e => {
  console.error('\n❌ TEST RUN FAILED:', e.message);
  process.exit(1);
});
