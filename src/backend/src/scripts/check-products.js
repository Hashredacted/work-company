'use strict';
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const URI = process.env.MONGODB_URI || process.env.MONGO_URI;

mongoose.connect(URI).then(async () => {
  const db = mongoose.connection.db;
  
  // Find all users and their tenants
  const users = await db.collection('users').find(
    { email: { $not: /platform\.com/ } },
    { projection: { email: 1, tenantId: 1, name: 1 } }
  ).toArray();
  
  console.log('All user accounts (non-super-admin):');
  for (const u of users) {
    const tenant = await db.collection('tenants').findOne({ _id: u.tenantId }, { projection: { name: 1 } });
    const productCount = u.tenantId ? await db.collection('invproducts').countDocuments({ tenantId: u.tenantId }) : 0;
    console.log({
      email: u.email,
      name: u.name,
      tenantId: u.tenantId?.toString(),
      tenantName: tenant?.name || 'N/A',
      products: productCount
    });
  }
  
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
