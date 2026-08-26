'use strict';

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const { connectDB } = require('../config/db');
const Category = require('../models/inv/Category');
const Product = require('../models/inv/Product');

async function clean() {
  await connectDB();
  console.log('[Clean] Connected to MongoDB');

  const legacyNames = [
    'General',
    'Electronics',
    'FMCG',
    'Apparel, Textiles & Garments',
    'Electronics & Electricals',
    'FMCG & Consumer Goods',
    'Hardware & Tools',
    'Packaging & Shipping Supplies',
    'Raw Materials & Components',
  ];

  const legacy = await Category.find({ name: { $in: legacyNames } });
  console.log(`[Clean] Found ${legacy.length} legacy category records`);

  for (const c of legacy) {
    const pCount = await Product.countDocuments({ categoryId: c._id });
    if (pCount === 0) {
      await Category.deleteOne({ _id: c._id });
      console.log(`[Clean] Removed unused legacy category: ${c.name} (${c._id})`);
    } else {
      console.log(`[Clean] Kept category in use: ${c.name} (${pCount} products)`);
    }
  }

  console.log('[Clean] Cleanup finished.');
  process.exit(0);
}

clean().catch(err => {
  console.error(err);
  process.exit(1);
});
