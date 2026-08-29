'use strict';

const mongoose    = require('mongoose');
const Product     = require('../../models/inv/Product');
const StockLedger = require('../../models/inv/StockLedger');
const Warehouse   = require('../../models/inv/Warehouse');
const Supplier    = require('../../models/inv/Supplier');
const Customer    = require('../../models/inv/Customer');
const Tenant      = require('../../models/Tenant');
const PaymentTransaction = require('../../models/inv/PaymentTransaction');

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
      const price = p.purchasePrice || p.mrp || p.sellingPrice || 0;
      return {
        ...p,
        currentStock: s.currentStock,
        stockValue: Math.round(s.currentStock * price),
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
      const unitPrice = p.purchasePrice || p.mrp || p.sellingPrice || 0;
      const stockVal = Math.round(s.currentStock * unitPrice);
      return {
        productId: s._id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        purchasePrice: p.purchasePrice || unitPrice,
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
    const rawTenant = req.query.tenantId || req.headers['x-tenant-id'];
    const targetTenantId = (rawTenant && req.isSuperAdmin)
      ? new mongoose.Types.ObjectId(rawTenant)
      : (req.tenantId ? new mongoose.Types.ObjectId(req.tenantId) : null);

    if (!targetTenantId) {
      return res.json({
        data: {
          total: { items: 0, suppliers: 0, customers: 0 },
          outstanding: {
            suppliers: { payed: 0, due: 0 },
            customers: { recieved: 0, due: 0 },
          },
          retail: {
            sales: { bills: 0, totalAmount: 0 },
            purchased: { bills: 0, totalAmount: 0 },
          },
          account: { cashBalance: 0, bankBalance: 0 },
          totalProducts: 0,
          lowStockProducts: 0,
          totalWarehouses: 0,
          stockValue: 0,
          recentActivity: [],
          overdueAlerts: [],
        },
        message: 'OK',
        errors: null,
      });
    }

    const [
      totalProducts,
      totalSuppliers,
      totalCustomers,
      lowStockCount,
      totalWarehouses,
      stockValAgg,
      recentActivity,
      outstandingAgg,
      retailTradingAgg,
      paymentsAgg,
      modeAgg,
      rawOverdue,
      rawTenantInfo,
    ] = await Promise.all([
      Product.countDocuments({ tenantId: targetTenantId, deletedAt: null, isActive: true }),
      Supplier.countDocuments({ tenantId: targetTenantId, deletedAt: null }),
      Customer.countDocuments({ tenantId: targetTenantId, deletedAt: null }),
      (async () => {
        const products = await Product.find({ tenantId: targetTenantId, deletedAt: null, isActive: true, reorderLevel: { $gt: 0 } }).lean();
        if (!products.length) return 0;
        const ids = products.map(p => p._id);
        const agg = await StockLedger.aggregate([
          { $match: { tenantId: targetTenantId, productId: { $in: ids } } },
          { $group: { _id: '$productId', qty: { $sum: '$qty' } } },
        ]);
        const map = Object.fromEntries(agg.map(a => [a._id.toString(), a.qty]));
        return products.filter(p => (map[p._id.toString()] || 0) <= p.reorderLevel).length;
      })(),
      Warehouse.countDocuments({ tenantId: targetTenantId, deletedAt: null, isActive: true }),
      (async () => {
        const products = await Product.find({ tenantId: targetTenantId, deletedAt: null }).select('purchasePrice mrp sellingPrice').lean();
        const prodMap = Object.fromEntries(products.map(p => [p._id.toString(), p.purchasePrice || p.mrp || p.sellingPrice || 0]));
        const agg = await StockLedger.aggregate([
          { $match: { tenantId: targetTenantId } },
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
      StockLedger.find({ tenantId: targetTenantId })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('productId', 'name sku unit')
        .populate('warehouseId', 'name')
        .lean(),
      PaymentTransaction.aggregate([
        { $match: { tenantId: targetTenantId, txnType: { $in: ['INVOICE', 'BILL', 'OPENING_BAL'] } } },
        {
          $group: {
            _id: '$partyType',
            totalBilled: { $sum: '$amount' },
            totalSettled: { $sum: { $ifNull: ['$settledAmount', 0] } },
            totalDue: {
              $sum: {
                $cond: [
                  { $gt: [{ $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] }, 0] },
                  { $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] },
                  0,
                ],
              },
            },
          },
        },
      ]),
      PaymentTransaction.aggregate([
        { $match: { tenantId: targetTenantId, txnType: { $in: ['INVOICE', 'BILL'] } } },
        {
          $group: {
            _id: '$txnType',
            totalAmount: { $sum: '$amount' },
            billsCount: { $sum: 1 },
          },
        },
      ]),
      PaymentTransaction.aggregate([
        { $match: { tenantId: targetTenantId, txnType: { $in: ['PAYMENT_IN', 'PAYMENT_OUT', 'OUTSIDE_INFLOW', 'OUTSIDE_OUTFLOW'] } } },
        { $group: { _id: '$txnType', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      PaymentTransaction.aggregate([
        { $match: { tenantId: targetTenantId, txnType: { $in: ['PAYMENT_IN', 'PAYMENT_OUT', 'OUTSIDE_INFLOW', 'OUTSIDE_OUTFLOW'] } } },
        { $group: { _id: { txnType: '$txnType', paymentMode: '$paymentMode' }, total: { $sum: '$amount' } } },
      ]),
      PaymentTransaction.find({
        tenantId: targetTenantId,
        dueDate: { $ne: null, $lt: new Date() },
        txnType: { $in: ['INVOICE', 'BILL'] },
        paymentStatus: { $ne: 'PAID' },
      })
        .sort({ dueDate: 1 })
        .limit(10)
        .populate('partyId', 'name phone contactName')
        .lean(),
      Tenant.findById(targetTenantId).select('initialWorkingCapital').lean(),
    ]);

    const tenantInfo = rawTenantInfo || {};
    const initialWorkingCapital = tenantInfo.initialWorkingCapital || 0;

    const supBillData = outstandingAgg.find(a => a._id === 'SUPPLIER');
    const custBillData = outstandingAgg.find(a => a._id === 'CUSTOMER');
    const salesBillData = retailTradingAgg.find(a => a._id === 'INVOICE');
    const purchBillData = retailTradingAgg.find(a => a._id === 'BILL');

    const payInTotal = paymentsAgg.find(a => a._id === 'PAYMENT_IN')?.totalAmount || 0;
    const payOutTotal = paymentsAgg.find(a => a._id === 'PAYMENT_OUT')?.totalAmount || 0;
    const outsideInTotal = paymentsAgg.find(a => a._id === 'OUTSIDE_INFLOW')?.totalAmount || 0;
    const outsideOutTotal = paymentsAgg.find(a => a._id === 'OUTSIDE_OUTFLOW')?.totalAmount || 0;

    let cashIn = 0, cashOut = 0, bankIn = 0, bankOut = 0;
    (modeAgg || []).forEach(m => {
      const mode = m._id?.paymentMode || '';
      const isCash = mode === 'CASH';
      const isBank = ['UPI', 'NEFT_RTGS', 'CHEQUE', 'NET_BANKING', 'CARD', 'ONLINE', 'BANK_TRANSFER'].includes(mode);
      const isInflow = m._id?.txnType === 'PAYMENT_IN' || m._id?.txnType === 'OUTSIDE_INFLOW';
      const isOutflow = m._id?.txnType === 'PAYMENT_OUT' || m._id?.txnType === 'OUTSIDE_OUTFLOW';

      if (isInflow) {
        if (isCash) cashIn += m.total;
        if (isBank) bankIn += m.total;
      } else if (isOutflow) {
        if (isCash) cashOut += m.total;
        if (isBank) bankOut += m.total;
      }
    });

    const overdueAlerts = (rawOverdue || []).map(b => ({
      _id: b._id,
      voucherNo: b.voucherNo,
      partyId: b.partyId?._id || b.partyId,
      partyName: b.partyId?.name || (b.partyType === 'CUSTOMER' ? 'Customer' : 'Supplier'),
      partyPhone: b.partyId?.phone || '',
      partyType: b.partyType,
      totalAmount: b.amount,
      pendingAmount: Math.max(0, b.amount - (b.settledAmount || 0)),
      daysOverdue: Math.max(1, Math.floor((Date.now() - new Date(b.dueDate)) / 86400000)),
      dueDate: b.dueDate,
    })).filter(b => b.pendingAmount > 0);

    const custDue = custBillData?.totalDue || 0;
    const supDue = supBillData?.totalDue || 0;

    res.json({
      data: {
        total: { items: totalProducts, suppliers: totalSuppliers, customers: totalCustomers },
        initialWorkingCapital,
        netWorkingCapital: initialWorkingCapital + custDue - supDue,
        outstanding: {
          suppliers: {
            payed: payOutTotal || (supBillData?.totalSettled || 0),
            due: supDue,
          },
          customers: {
            recieved: payInTotal || (custBillData?.totalSettled || 0),
            due: custDue,
          },
        },
        retail: {
          sales: { bills: salesBillData?.billsCount || 0, totalAmount: salesBillData?.totalAmount || 0 },
          purchased: { bills: purchBillData?.billsCount || 0, totalAmount: purchBillData?.totalAmount || 0 },
        },
        account: {
          cashBalance: cashIn - cashOut,
          bankBalance: bankIn - bankOut,
          cashIn,
          cashOut,
          bankIn,
          bankOut,
          outsideCashflow: {
            inflow: outsideInTotal,
            outflow: outsideOutTotal,
            net: outsideInTotal - outsideOutTotal,
          },
        },
        totalProducts,
        lowStockProducts: lowStockCount,
        totalWarehouses,
        stockValue: stockValAgg,
        recentActivity,
        overdueAlerts,
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
