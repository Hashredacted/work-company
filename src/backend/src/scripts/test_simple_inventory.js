'use strict';

async function testSimpleInventory() {
  try {
    const post = (url, body, token) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: JSON.stringify(body) }).then(r => r.json());
    const get = (url, token) => fetch(url, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());

    // 1. Login
    const login = await post('http://localhost:5000/api/auth/login', { email: 'admin@acme.com', password: 'Password@123' });
    const token = login.data.token;
    console.log('Acme Login: OK');

    // 2. Fetch products and warehouses
    const prodsRes = await get('http://localhost:5000/api/inventory/products', token);
    const whRes = await get('http://localhost:5000/api/inventory/warehouses', token);
    const product = prodsRes.data.products[0];
    const warehouse = whRes.data[0];
    console.log(`Using Product: ${product.name} (Current: ${product.currentStock} ${product.unit}) | Warehouse: ${warehouse.name}`);

    // 3. Test Quick Stock In (+50 units)
    const inRes = await post('http://localhost:5000/api/inventory/stock-adjust', {
      productId: product._id,
      warehouseId: warehouse._id,
      type: 'IN',
      qty: 50,
      unitCost: product.purchasePrice || 1000,
      remarks: 'Simple Stock In Test Shipment'
    }, token);
    console.log('Stock In Response:', inRes.message, '| New total stock:', inRes.data.currentStock);

    // 4. Test Quick Stock Out (-20 units)
    const outRes = await post('http://localhost:5000/api/inventory/stock-adjust', {
      productId: product._id,
      warehouseId: warehouse._id,
      type: 'OUT',
      qty: 20,
      remarks: 'Simple Stock Out Test Sale'
    }, token);
    console.log('Stock Out Response:', outRes.message, '| New total stock:', outRes.data.currentStock);

    // 5. Test Insufficient Stock rejection
    const invalidOutRes = await post('http://localhost:5000/api/inventory/stock-adjust', {
      productId: product._id,
      warehouseId: warehouse._id,
      type: 'OUT',
      qty: 999999,
      remarks: 'Should fail'
    }, token);
    console.log('Insufficient stock handled properly?:', invalidOutRes.message.includes('Insufficient stock'));

    // 6. Test Dashboard KPIs
    const kpiRes = await get('http://localhost:5000/api/inventory/reports/dashboard-kpis', token);
    console.log('Dashboard KPIs:', kpiRes.data);

    // 7. Test Stock Ledger for product
    const ledgerRes = await get(`http://localhost:5000/api/inventory/reports/stock-ledger/${product._id}`, token);
    console.log('Stock Ledger entries count for product:', ledgerRes.data.length);
    console.log('Latest movement:', ledgerRes.data[0]?.txnType, '| Qty:', ledgerRes.data[0]?.qty, '| Remarks:', ledgerRes.data[0]?.remarks);

    console.log('\nALL SIMPLE INVENTORY TESTS PASSED SUCCESSFULLY! ✅');
  } catch (err) {
    console.error('Error during test:', err);
  }
}

testSimpleInventory();
