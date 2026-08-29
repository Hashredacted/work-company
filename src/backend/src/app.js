'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const dotenv = require('dotenv');

// app.js is at src/backend/src/app.js
// backend folder is 1 level up: ../.env
// root is 3 levels up: ../../../.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { connectDB } = require('./config/db');
const { apiLimiter, authLimiter, sanitizeInput } = require('./middlewares/security');

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

// ─── Security Headers (Helmet) ───────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'", 'http://localhost:5000', 'http://127.0.0.1:5000'],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
        scriptSrcElem: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        styleSrcElem: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", 'http://localhost:5000', 'http://127.0.0.1:5000', 'ws://localhost:5000', 'ws://127.0.0.1:5000', 'https://wa.me'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ─── Core Middleware ─────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInput); // NoSQL Injection sanitization

// ─── Serve Frontend Static Files ─────────────────────────────────────────────
const frontendPath = path.resolve(__dirname, '../../frontend');
const htmlPath = path.join(frontendPath, 'html');
const cssPath = path.join(frontendPath, 'css');
const jsPath = path.join(frontendPath, 'js');

app.use(express.static(frontendPath));
app.use(express.static(htmlPath));
app.use('/css', express.static(cssPath));
app.use('/js', express.static(jsPath));

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ data: { status: 'ok', secure: true }, message: 'Server is running', errors: null });
});

// ─── API Routes with Rate Limiting ───────────────────────────────────────────
app.use('/api/', apiLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/users', userRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/inventory', inventoryRoutes);

// ─── Root & Frontend HTML fallback ───────────────────────────────────────────
app.get('/', (_req, res) => {
  res.sendFile(path.join(htmlPath, 'index.html'));
});

// ─── 404 Handler for API and UI routes ─────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ data: null, message: 'Route not found', errors: null });
  }
  res.sendFile(path.join(htmlPath, 'index.html'));
});

// ─── Central Error Handler ────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  start();
}

module.exports = app;
