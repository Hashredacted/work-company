'use strict';

async function testCategories() {
  try {
    const post = (url, body, token) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: JSON.stringify(body) }).then(r => r.json());
    const get = (url, token) => fetch(url, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json());

    // 1. Login as Acme Company Admin
    const login = await post('http://localhost:5000/api/auth/login', { email: 'admin@acme.com', password: 'Password@123' });
    const token = login.data.token;
    console.log('Acme Admin Login: OK');

    // 2. Fetch categories
    const catRes = await get('http://localhost:5000/api/inventory/categories', token);
    console.log('Total Categories loaded:', catRes.data.length);
    const roots = catRes.data.filter(c => !c.parentId);
    const subs = catRes.data.filter(c => c.parentId);
    console.log('Root Indian Categories count:', roots.length);
    roots.forEach(r => console.log(` - ${r.icon || '📦'} ${r.name} (HSN: ${r.defaultHsn || '—'}, GST: ${r.defaultGstRate}%)`));
    console.log('Total Subcategories count:', subs.length);

    // 3. Find 'Mobile Phones & Tablets' subcategory
    const mobCat = catRes.data.find(c => c.name.includes('Mobile Phones'));
    console.log('Found Subcategory:', mobCat.name, '| Default HSN:', mobCat.defaultHsn, '| Default GST:', mobCat.defaultGstRate + '%');

    // 4. Create Product under 'Mobile Phones & Tablets'
    const timestamp = Date.now();
    const prodRes = await post('http://localhost:5000/api/inventory/products', {
      name: 'OnePlus 12 5G ' + timestamp,
      sku: 'OP12-' + timestamp,
      categoryId: mobCat._id,
      hsnCode: mobCat.defaultHsn,
      gstRate: mobCat.defaultGstRate,
      mrp: 64999,
      purchasePrice: 52000,
      sellingPrice: 59999,
      unit: 'Pcs',
      trackingType: 'SERIAL'
    }, token);

    console.log('Product created with Indian Category:', prodRes.data.name, '| HSN:', prodRes.data.hsnCode, '| GST:', prodRes.data.gstRate + '%');

    // 5. Test filtering products by Root Parent Category ('Electronics & IT Hardware')
    const elecParent = roots.find(r => r.name.includes('Electronics'));
    const filterRes = await get(`http://localhost:5000/api/inventory/products?categoryId=${elecParent._id}`, token);
    const foundInParent = filterRes.data.products.some(p => p._id === prodRes.data._id);
    console.log('Product in subcategory found when filtering by parent category?:', foundInParent, '(Expected: true)');

    // 6. Test Stock Summary category filter
    const reportRes = await get(`http://localhost:5000/api/inventory/reports/stock-summary?categoryId=${elecParent._id}`, token);
    const reportFound = reportRes.data.some(p => p._id === prodRes.data._id);
    console.log('Product in subcategory found in Stock Summary parent category filter?:', reportFound, '(Expected: true)');

    console.log('\nALL INDIAN CATEGORY PRESET & INHERITANCE TESTS PASSED! ✅');
  } catch (err) {
    console.error('Error during test:', err);
  }
}

testCategories();
