'use strict';

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const { connectDB } = require('../config/db');
const Category = require('../models/inv/Category');
const Product = require('../models/inv/Product');

async function migrate() {
  await connectDB();

  // Find legacy categories
  const legacyCats = await Category.find({ name: { $in: ['Electronics', 'FMCG', 'General'] } });
  for (const leg of legacyCats) {
    let target = null;
    if (leg.name === 'Electronics') {
      target = await Category.findOne({ tenantId: leg.tenantId, name: 'Computers, Laptops & Servers' }) ||
               await Category.findOne({ tenantId: leg.tenantId, name: 'Electronics & IT Hardware' });
    } else if (leg.name === 'FMCG') {
      target = await Category.findOne({ tenantId: leg.tenantId, name: 'FMCG, Personal Care & Cleaning' });
    } else {
      target = await Category.findOne({ tenantId: leg.tenantId, name: 'Industrial, Hardware & Machinery' });
    }

    if (target) {
      const updated = await Product.updateMany({ categoryId: leg._id }, { $set: { categoryId: target._id } });
      console.log(`Reassigned ${updated.modifiedCount} product(s) from "${leg.name}" to "${target.name}"`);
      await Category.deleteOne({ _id: leg._id });
      console.log(`Deleted legacy category: ${leg.name}`);
    }
  }

  console.log('Migration completed.');
  process.exit(0);
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
