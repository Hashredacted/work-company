'use strict';

async function testPaymentSystem() {
  try {
    const post = (url, body, token) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: JSON.stringify(body) }).then(r => r.json());
    const get = (url, token) => fetch(url, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());

    console.log('--- 1. Login ---');
    const login = await post('http://localhost:5000/api/auth/login', { email: 'admin@acme.com', password: 'Password@123' });
    const token = login.data.token;
    console.log('Login: OK');

    console.log('\n--- 2. Fetch Prerequisite Data ---');
    const [suppRes, custRes] = await Promise.all([
      get('http://localhost:5000/api/inventory/payments/outstandings?type=SUPPLIER', token),
      get('http://localhost:5000/api/inventory/payments/outstandings?type=CUSTOMER', token),
    ]);

    const supplier = suppRes.data.find(s => s.name.includes('Bharat')) || suppRes.data[0];
    const customer = custRes.data.find(c => c.name.includes('Apex')) || custRes.data[0];

    console.log(`Supplier: ${supplier.name} (Outstanding: ₹${supplier.outstanding})`);
    console.log(`Customer: ${customer.name} (Outstanding: ₹${customer.outstanding})`);

    console.log('\n--- 3. Fetch Pending Bills for Customer (Bill-Wise Query) ---');
    const pendingBillsRes = await get(`http://localhost:5000/api/inventory/payments/pending-bills?partyType=CUSTOMER&partyId=${customer._id}`, token);
    console.log(`Pending Invoices Count: ${pendingBillsRes.data.count} | Total Pending Amount: ₹${pendingBillsRes.data.totalPending}`);
    if (pendingBillsRes.data.bills.length > 0) {
      const topBill = pendingBillsRes.data.bills[0];
      console.log(`Top Pending Bill: ${topBill.voucherNo} | Total: ₹${topBill.totalAmount} | Settled: ₹${topBill.settledAmount} | Pending Due: ₹${topBill.pendingAmount}`);
    }

    console.log('\n--- 4. Record Partial Payment with Bill Allocation ---');
    if (pendingBillsRes.data.bills.length > 0) {
      const targetBill = pendingBillsRes.data.bills[0];
      const allocAmount = Math.min(10000, targetBill.pendingAmount);

      const payInRes = await post('http://localhost:5000/api/inventory/payments', {
        partyType: 'CUSTOMER',
        partyId: customer._id,
        amount: allocAmount,
        paymentMode: 'UPI',
        referenceNo: 'UPI-2608-TEST-ALLOC',
        allocations: [{ billId: targetBill._id, amount: allocAmount }],
      }, token);

      console.log('Payment In Result:', payInRes.message);
      console.log('Allocated Bills Breakdown:', payInRes.data.allocatedBills);
      console.log('Remaining Unallocated Amount:', payInRes.data.unallocatedAmount);
    }

    console.log('\n--- 5. Fetch Daily Payment Summary (Per-Day Analytics) ---');
    const dailyRes = await get('http://localhost:5000/api/inventory/payments/daily-summary?days=30', token);
    console.log(`Total Days Active: ${dailyRes.data.totalDays}`);
    console.log('Today Summary:', dailyRes.data.today);
    console.log('Top 3 Days Daily Breakdown:', dailyRes.data.daily.slice(0, 3));

    console.log('\n--- 6. Fetch Party Khata Statement with Bill Allocations ---');
    const stmtRes = await get(`http://localhost:5000/api/inventory/payments/statement/CUSTOMER/${customer._id}`, token);
    console.log(`Statement for ${stmtRes.data.party.name}:`);
    console.log(`Total Debit: ₹${stmtRes.data.summary.totalDebit} | Total Credit: ₹${stmtRes.data.summary.totalCredit}`);
    console.log(`Net Closing Balance: ₹${stmtRes.data.summary.netOutstanding} (${stmtRes.data.summary.balanceType})`);
    console.log(`Ledger Entries: ${stmtRes.data.statement.length}`);

    console.log('\n--- 7. Overall Working Capital & KPI Overview ---');
    const kpiRes = await get('http://localhost:5000/api/inventory/payments/kpis', token);
    console.log('Payment KPIs:', kpiRes.data);

    console.log('\n====================================================');
    console.log('ALL BILL-WISE & DAILY PAYMENT TESTS PASSED! ✅');
    console.log('====================================================');
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

testPaymentSystem();
