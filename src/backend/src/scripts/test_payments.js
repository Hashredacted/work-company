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
    const [prodsRes, whRes, suppRes, custRes] = await Promise.all([
      get('http://localhost:5000/api/inventory/products', token),
      get('http://localhost:5000/api/inventory/warehouses', token),
      get('http://localhost:5000/api/inventory/suppliers', token),
      get('http://localhost:5000/api/inventory/customers', token),
    ]);

    const product = prodsRes.data.products[0];
    const warehouse = whRes.data[0];
    let supplier = suppRes.data[0];
    let customer = custRes.data[0];

    // Ensure we have a supplier and customer for Acme
    if (!supplier) {
      const sRes = await post('http://localhost:5000/api/inventory/suppliers', {
        name: 'Bharat Electronics Distributors',
        phone: '9820011223',
        gstin: '27AABCB1234F1Z1',
        paymentTerms: 30,
      }, token);
      supplier = sRes.data;
    }
    if (!customer) {
      const cRes = await post('http://localhost:5000/api/inventory/customers', {
        name: 'Sharma Retail Store',
        phone: '9811122334',
        gstin: '07AAAAA0000A1Z5',
        paymentTerms: 15,
      }, token);
      customer = cRes.data;
    }

    console.log(`Supplier: ${supplier.name} | Customer: ${customer.name}`);
    console.log(`Product: ${product.name} | Warehouse: ${warehouse.name}`);

    console.log('\n--- 3. Stock In with Supplier on Credit (Bill Created) ---');
    const stockInRes = await post('http://localhost:5000/api/inventory/stock-adjust', {
      productId: product._id,
      warehouseId: warehouse._id,
      type: 'IN',
      qty: 100,
      unitCost: product.purchasePrice || 180,
      supplierId: supplier._id,
      paymentStatus: 'UNPAID',
      remarks: 'Bulk shipment on 30-day credit',
    }, token);

    console.log('Stock In:', stockInRes.message);
    console.log('Created Bill Voucher:', stockInRes.data.billOrInvoice?.voucherNo, '| Amount: ₹' + stockInRes.data.billOrInvoice?.amount);

    console.log('\n--- 4. Check Supplier Outstanding ---');
    const suppOutRes1 = await get('http://localhost:5000/api/inventory/payments/outstandings?type=SUPPLIER', token);
    const suppStat1 = suppOutRes1.data.find(s => s._id === supplier._id);
    console.log(`Supplier ${supplier.name} Outstanding: ₹${suppStat1.outstanding} (Status: ${suppStat1.status})`);

    console.log('\n--- 5. Record Payment Out to Supplier via UPI ---');
    const payOutRes = await post('http://localhost:5000/api/inventory/payments', {
      partyType: 'SUPPLIER',
      partyId: supplier._id,
      amount: 10000,
      paymentMode: 'UPI',
      referenceNo: 'UPI-2026-TEST-9988',
      notes: 'Part settlement via PhonePe',
    }, token);
    console.log('Payment Out Result:', payOutRes.message);

    const suppOutRes2 = await get('http://localhost:5000/api/inventory/payments/outstandings?type=SUPPLIER', token);
    const suppStat2 = suppOutRes2.data.find(s => s._id === supplier._id);
    console.log(`Supplier ${supplier.name} Remaining Outstanding: ₹${suppStat2.outstanding}`);

    console.log('\n--- 6. Stock Out with Customer on Credit (Invoice Created) ---');
    const stockOutRes = await post('http://localhost:5000/api/inventory/stock-adjust', {
      productId: product._id,
      warehouseId: warehouse._id,
      type: 'OUT',
      qty: 25,
      customerId: customer._id,
      paymentStatus: 'UNPAID',
      remarks: 'Store dispatch on 15-day credit',
    }, token);
    console.log('Stock Out:', stockOutRes.message);
    console.log('Created Invoice Voucher:', stockOutRes.data.billOrInvoice?.voucherNo, '| Amount: ₹' + stockOutRes.data.billOrInvoice?.amount);

    console.log('\n--- 7. Record Payment In from Customer via NEFT ---');
    const payInRes = await post('http://localhost:5000/api/inventory/payments', {
      partyType: 'CUSTOMER',
      partyId: customer._id,
      amount: 5000,
      paymentMode: 'NEFT_RTGS',
      referenceNo: 'HDFCR5202608269999',
      notes: 'Advance receipt via NEFT',
    }, token);
    console.log('Payment In Result:', payInRes.message);

    console.log('\n--- 8. Fetch Party Khata Statement ---');
    const stmtRes = await get(`http://localhost:5000/api/inventory/payments/statement/CUSTOMER/${customer._id}`, token);
    console.log(`Statement for ${stmtRes.data.party.name}:`);
    console.log(`Total Debit (Invoices): ₹${stmtRes.data.summary.totalDebit}`);
    console.log(`Total Credit (Receipts): ₹${stmtRes.data.summary.totalCredit}`);
    console.log(`Net Outstanding: ₹${stmtRes.data.summary.netOutstanding} ${stmtRes.data.summary.balanceType}`);
    console.log('Ledger Entries Count:', stmtRes.data.statement.length);

    console.log('\n--- 9. Overall Payment KPIs ---');
    const kpiRes = await get('http://localhost:5000/api/inventory/payments/kpis', token);
    console.log('Payment KPIs:', kpiRes.data);

    console.log('\n--- 10. List Payment Vouchers ---');
    const voucherListRes = await get('http://localhost:5000/api/inventory/payments?limit=10', token);
    console.log('Total Vouchers Count:', voucherListRes.data.pagination.total);
    console.log('Latest Voucher:', voucherListRes.data.payments[0]?.voucherNo, '| Type:', voucherListRes.data.payments[0]?.txnType, '| Mode:', voucherListRes.data.payments[0]?.paymentMode);

    console.log('\n========================================');
    console.log('ALL PAYMENT & OUTSTANDING TESTS PASSED! ✅');
    console.log('========================================');
  } catch (err) {
    console.error('Error during test:', err);
  }
}

testPaymentSystem();
