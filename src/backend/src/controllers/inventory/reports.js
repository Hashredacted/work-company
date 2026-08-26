'use strict';

const mongoose    = require('mongoose');
const Product     = require('../../models/inv/Product');
const StockLedger = require('../../models/inv/StockLedger');
const Warehouse   = require('../../models/inv/Warehouse');

// ─── GET /api/inventory/reports/stock-summary ─────────────────────────────────
// Current stock per product (all warehouses combined or filtered by warehouse/category)
async function stockSummary(req, res, next) {
  try {
    const { warehouseId, categoryId } = req.query;

    const match = { tenantId: req.tenantId };
    if (warehouseId) match.warehouseId = new mongoose.Types.ObjectId(warehouseId);

    const stockAgg = await StockLedger.aggregate([
      { $match: match },
      { $group: { _id: '$productId', currentStock: { $sum: '$qty' }, totalCost: { $sum: '$totalCost' } } },
    ]);

    const stockMap = Object.fromEntries(stockAgg.map(s => [s._id.toString(), s]));

    const prodFilter = { tenantId: req.tenantId, deletedAt: null, isActive: true };
    if (categoryId) {
      const Category = require('../../models/inv/Category');
      const subCats = await Category.find({ tenantId: req.tenantId, parentId: categoryId, deletedAt: null }).select('_id');
      const catIds = [new mongoose.Types.ObjectId(categoryId), ...subCats.map(s => s._id)];
      prodFilter.categoryId = { $in: catIds };
    }
    const products = await Product.find(prodFilter).populate('categoryId', 'name icon').sort({ name: 1 }).lean();

    const result = products.map(p => {
      const s = stockMap[p._id.toString()] || { currentStock: 0, totalCost: 0 };
      return {
        ...p,
        currentStock: s.currentStock,
        stockValue: Math.round(s.currentStock * p.purchasePrice),
        isLowStock: s.currentStock <= p.reorderLevel,
      };
    });

    res.json({ data: result, message: 'OK', errors: null });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/reports/stock-ledger/:productId ───────────────────────
async function stockLedger(req, res, next) {
  try {
    const { warehouseId, from, to, page = 1, limit = 100 } = req.query;
    const match = { tenantId: req.tenantId, productId: new mongoose.Types.ObjectId(req.params.productId) };
    if (warehouseId) match.warehouseId = new mongoose.Types.ObjectId(warehouseId);
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) match.date.$lte = new Date(to);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const entries = await StockLedger.find(match)
      .populate('warehouseId', 'name code')
      .populate('productId', 'name sku')
      .sort({ date: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    res.json({ data: entries, message: 'OK', errors: null });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/reports/valuation ─────────────────────────────────────
// Stock value based on current stock and purchase cost
async function valuation(req, res, next) {
  try {
    const stockAgg = await StockLedger.aggregate([
      { $match: { tenantId: req.tenantId } },
      { $group: { _id: '$productId', currentStock: { $sum: '$qty' } } },
      { $match: { currentStock: { $gt: 0 } } },
    ]);

    const ids = stockAgg.map(s => s._id);
    const products = await Product.find({ _id: { $in: ids }, tenantId: req.tenantId, deletedAt: null }).lean();
    const prodMap = Object.fromEntries(products.map(p => [p._id.toString(), p]));

    const result = stockAgg.map(s => {
      const p = prodMap[s._id.toString()] || {};
      const stockVal = Math.round(s.currentStock * (p.purchasePrice || 0));
      return {
        productId: s._id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        purchasePrice: p.purchasePrice || 0,
        currentStock: s.currentStock,
        stockValue: stockVal,
      };
    });

    const totalValue = result.reduce((a, r) => a + r.stockValue, 0);
    res.json({ data: { items: result, totalValue }, message: 'OK', errors: null });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/reports/expiry-alerts ─────────────────────────────────
async function expiryAlerts(req, res, next) {
  try {
    const days = Number(req.query.days) || 30;
    const cutoff = new Date(Date.now() + days * 86400000);

    const alerts = await StockLedger.aggregate([
      { $match: { tenantId: req.tenantId, expiryDate: { $ne: null, $lte: cutoff } } },
      { $group: { _id: { productId: '$productId', batchNo: '$batchNo', expiryDate: '$expiryDate', warehouseId: '$warehouseId' }, qty: { $sum: '$qty' } } },
      { $match: { qty: { $gt: 0 } } },
      { $sort: { '_id.expiryDate': 1 } },
    ]);

    const prodIds = alerts.map(a => a._id.productId);
    const whIds   = alerts.map(a => a._id.warehouseId);
    const [prods, whs] = await Promise.all([
      Product.find({ _id: { $in: prodIds } }).select('name sku unit').lean(),
      Warehouse.find({ _id: { $in: whIds } }).select('name code').lean(),
    ]);

    const prodMap = Object.fromEntries(prods.map(p => [p._id.toString(), p]));
    const whMap   = Object.fromEntries(whs.map(w => [w._id.toString(), w]));

    const formatted = alerts.map(a => ({
      product: prodMap[a._id.productId?.toString()] || null,
      warehouse: whMap[a._id.warehouseId?.toString()] || null,
      batchNo: a._id.batchNo || '—',
      expiryDate: a._id.expiryDate,
      qty: a.qty,
      daysLeft: Math.ceil((new Date(a._id.expiryDate) - new Date()) / 86400000),
    }));

    res.json({ data: formatted, message: 'OK', errors: null });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/reports/dashboard-kpis ────────────────────────────────
async function dashboardKpis(req, res, next) {
  try {
    const [totalProducts, lowStockCount, totalWarehouses, stockValAgg, recentActivity] = await Promise.all([
      Product.countDocuments({ tenantId: req.tenantId, deletedAt: null, isActive: true }),
      (async () => {
        const products = await Product.find({ tenantId: req.tenantId, deletedAt: null, isActive: true, reorderLevel: { $gt: 0 } }).lean();
        if (!products.length) return 0;
        const ids = products.map(p => p._id);
        const agg = await StockLedger.aggregate([
          { $match: { tenantId: req.tenantId, productId: { $in: ids } } },
          { $group: { _id: '$productId', qty: { $sum: '$qty' } } },
        ]);
        const map = Object.fromEntries(agg.map(a => [a._id.toString(), a.qty]));
        return products.filter(p => (map[p._id.toString()] || 0) <= p.reorderLevel).length;
      })(),
      Warehouse.countDocuments({ tenantId: req.tenantId, deletedAt: null, isActive: true }),
      (async () => {
        const products = await Product.find({ tenantId: req.tenantId, deletedAt: null, isActive: true }).select('purchasePrice').lean();
        const prodMap = Object.fromEntries(products.map(p => [p._id.toString(), p.purchasePrice || 0]));
        const agg = await StockLedger.aggregate([
          { $match: { tenantId: req.tenantId } },
          { $group: { _id: '$productId', qty: { $sum: '$qty' } } },
        ]);
        let sum = 0;
        for (const item of agg) {
          if (item.qty > 0) {
            sum += item.qty * (prodMap[item._id.toString()] || 0);
          }
        }
        return Math.round(sum);
      })(),
      StockLedger.find({ tenantId: req.tenantId })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('productId', 'name sku unit')
        .populate('warehouseId', 'name')
        .lean(),
    ]);

    res.json({
      data: {
        totalProducts,
        lowStockProducts: lowStockCount,
        totalWarehouses,
        stockValue: stockValAgg,
        recentActivity,
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  stockSummary,
  stockLedger,
  valuation,
  expiryAlerts,
  dashboardKpis,
};
