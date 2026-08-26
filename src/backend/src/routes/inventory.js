'use strict';

const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth');

const catCtrl  = require('../controllers/inventory/category');
const prodCtrl = require('../controllers/inventory/product');
const supCtrl  = require('../controllers/inventory/supplier');
const cusCtrl  = require('../controllers/inventory/customer');
const whCtrl   = require('../controllers/inventory/warehouse');
const adjCtrl  = require('../controllers/inventory/adjustment');
const repCtrl  = require('../controllers/inventory/reports');

const Tenant = require('../models/Tenant');

const READ   = authorize('inventory:read');
const MANAGE = authorize('inventory:manage');

// Resolve tenant context for inventory requests
async function resolveInventoryTenant(req, res, next) {
  if (!req.tenantId && req.isSuperAdmin) {
    if (req.query.tenantId) {
      req.tenantId = req.query.tenantId;
    } else {
      const activeTenant = await Tenant.findOne({ deletedAt: null }).sort({ createdAt: 1 }).lean();
      if (activeTenant) {
        req.tenantId = activeTenant._id;
      }
    }
  }
  if (!req.tenantId) {
    return res.status(400).json({ data: null, message: 'No active company found for inventory. Please register a company first.', errors: null });
  }
  next();
}

// All inventory routes require authentication & tenant context
router.use(authenticate);
router.use(resolveInventoryTenant);

// ─── Categories ──────────────────────────────────────────────────────────────
router.get   ('/categories',         READ,   catCtrl.list);
router.post  ('/categories',         MANAGE, catCtrl.create);
router.post  ('/categories/presets', MANAGE, catCtrl.seedPresets);
router.put   ('/categories/:id',     MANAGE, catCtrl.update);
router.delete('/categories/:id',     MANAGE, catCtrl.remove);

// ─── Products ─────────────────────────────────────────────────────────────────
router.get('/products/low-stock', READ, prodCtrl.lowStock);
router.get   ('/products',     READ,   prodCtrl.list);
router.get   ('/products/:id', READ,   prodCtrl.getOne);
router.post  ('/products',     MANAGE, prodCtrl.create);
router.put   ('/products/:id', MANAGE, prodCtrl.update);
router.delete('/products/:id', MANAGE, prodCtrl.remove);

// ─── Direct Stock Management & Adjustments ────────────────────────────────────
router.post('/stock-adjust', MANAGE, adjCtrl.quickStock);
router.get ('/adjustments',  READ,   adjCtrl.list);
router.post('/adjustments',  MANAGE, adjCtrl.create);

// ─── Suppliers ────────────────────────────────────────────────────────────────
router.get   ('/suppliers',     READ,   supCtrl.list);
router.get   ('/suppliers/:id', READ,   supCtrl.getOne);
router.post  ('/suppliers',     MANAGE, supCtrl.create);
router.put   ('/suppliers/:id', MANAGE, supCtrl.update);
router.delete('/suppliers/:id', MANAGE, supCtrl.remove);

// ─── Customers ────────────────────────────────────────────────────────────────
router.get   ('/customers',     READ,   cusCtrl.list);
router.get   ('/customers/:id', READ,   cusCtrl.getOne);
router.post  ('/customers',     MANAGE, cusCtrl.create);
router.put   ('/customers/:id', MANAGE, cusCtrl.update);
router.delete('/customers/:id', MANAGE, cusCtrl.remove);

// ─── Warehouses ───────────────────────────────────────────────────────────────
router.get   ('/warehouses',           READ,   whCtrl.list);
router.post  ('/warehouses',           MANAGE, whCtrl.create);
router.put   ('/warehouses/:id',       MANAGE, whCtrl.update);
router.delete('/warehouses/:id',       MANAGE, whCtrl.remove);
router.get   ('/warehouses/:id/stock', READ,   whCtrl.stockAtWarehouse);

// ─── Reports ──────────────────────────────────────────────────────────────────
router.get('/reports/dashboard-kpis',          READ, repCtrl.dashboardKpis);
router.get('/reports/stock-summary',           READ, repCtrl.stockSummary);
router.get('/reports/stock-ledger/:productId', READ, repCtrl.stockLedger);
router.get('/reports/valuation',               READ, repCtrl.valuation);
router.get('/reports/expiry-alerts',           READ, repCtrl.expiryAlerts);

module.exports = router;
