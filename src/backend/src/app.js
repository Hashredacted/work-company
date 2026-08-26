'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// app.js is at src/backend/src/app.js
// backend folder is 1 level up: ../.env
// root is 3 levels up: ../../../.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { connectDB } = require('./config/db');
const authRoutes = require('./routes/auth');
const companyRoutes = require('./routes/company');
const dashboardRoutes = require('./routes/dashboard');
const roleRoutes = require('./routes/role');
const userRoutes = require('./routes/user');
const billingRoutes = require('./routes/billing');
const auditRoutes = require('./routes/audit');
const inventoryRoutes = require('./routes/inventory');
const { errorHandler } = require('./middlewares/error');

const app = express();

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Serve Frontend Static Files ─────────────────────────────────────────────
const frontendPath = path.resolve(__dirname, '../../frontend');
app.use(express.static(frontendPath));

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ data: { status: 'ok' }, message: 'Server is running', errors: null });
});

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/users', userRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/inventory', inventoryRoutes);

// ─── Root & Frontend HTML fallback ───────────────────────────────────────────
app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ─── 404 Handler for API and UI routes ─────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ data: null, message: 'Route not found', errors: null });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[Server] Failed to connect to DB:', err.message);
    process.exit(1);
  });

module.exports = app;
