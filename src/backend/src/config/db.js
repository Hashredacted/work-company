'use strict';

const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not defined in environment variables');

  mongoose.connection.on('connected', () => console.log('[DB] MongoDB connected'));
  mongoose.connection.on('error', (err) => console.error('[DB] Connection error:', err));

  await mongoose.connect(uri);
}

module.exports = { connectDB };
