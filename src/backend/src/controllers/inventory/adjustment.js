'use strict';

const mongoose    = require('mongoose');
const Adjustment  = require('../../models/inv/Adjustment');
const StockLedger = require('../../models/inv/StockLedger');
const Product     = require('../../models/inv/Product');
const AuditLog    = require('../../models/AuditLog');
const { nextSeq } = require('../../utils/sequence');

// GET /api/inventory/adjustments
async function list(req, res, next) {
  try {
    const adjs = await Adjustment.find({ tenantId: req.tenantId })
      .populate('warehouseId', 'name code')
      .populate('items.productId', 'name sku')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ data: adjs, message: 'OK', errors: null });
  } catch (e) {
    next(e);
  }
}

// POST /api/inventory/stock-adjust (Quick direct Stock In / Out)
async function quickStock(req, res, next) {
  try {
    const { productId, warehouseId, type, qty, unitCost, batchNo, expiryDate, remarks } = req.body;
    if (!productId || !warehouseId || !type || !qty) {
      return res.status(400).json({ data: null, message: 'productId, warehouseId, type (IN/OUT), and qty are required', errors: null });
    }

    const numericQty = Math.abs(Number(qty));
    if (numericQty <= 0) {
      return res.status(400).json({ data: null, message: 'Quantity must be greater than 0', errors: null });
    }

    const product = await Product.findOne({ _id: productId, tenantId: req.tenantId, deletedAt: null });
    if (!product) {
      return res.status(404).json({ data: null, message: 'Product not found', errors: null });
    }

    // If stock OUT, verify available stock
    if (type === 'OUT') {
      const stockAgg = await StockLedger.aggregate([
        { $match: { tenantId: req.tenantId, productId: new mongoose.Types.ObjectId(productId), warehouseId: new mongoose.Types.ObjectId(warehouseId) } },
        { $group: { _id: null, total: { $sum: '$qty' } } },
      ]);
      const currentAvailable = stockAgg[0]?.total || 0;
      if (currentAvailable < numericQty) {
        return res.status(400).json({
          data: null,
          message: `Insufficient stock in selected warehouse. Available: ${currentAvailable} ${product.unit}, requested to remove: ${numericQty} ${product.unit}`,
          errors: null,
        });
      }
    }

    const actualQty = type === 'IN' ? numericQty : -numericQty;
    const cost = unitCost !== undefined ? Number(unitCost) : product.purchasePrice || 0;

    const ledgerEntry = await StockLedger.create({
      tenantId: req.tenantId,
      productId: product._id,
      warehouseId,
      txnType: type === 'IN' ? 'QUICK_STOCK_IN' : 'QUICK_STOCK_OUT',
      refModel: null,
      refId: null,
      date: new Date(),
      batchNo: batchNo || null,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      qty: actualQty,
      unitCost: cost,
      totalCost: Math.abs(actualQty * cost),
      remarks: remarks || (type === 'IN' ? 'Direct Stock In' : 'Direct Stock Out'),
      createdBy: req.user._id,
    });

    // Calculate new total stock
    const newStockAgg = await StockLedger.aggregate([
      { $match: { tenantId: req.tenantId, productId: product._id } },
      { $group: { _id: null, total: { $sum: '$qty' } } },
    ]);
    const newTotalStock = newStockAgg[0]?.total || 0;

    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: type === 'IN' ? 'STOCK_IN' : 'STOCK_OUT',
      resource: 'inventory',
      resourceId: product._id.toString(),
      details: { productName: product.name, sku: product.sku, qty: actualQty, newTotalStock, remarks },
      ip: req.ip,
    });

    res.status(201).json({
      data: { ledgerEntry, currentStock: newTotalStock },
      message: `Stock successfully ${type === 'IN' ? 'added (+)' : 'reduced (-)'}. New total: ${newTotalStock} ${product.unit}`,
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// POST /api/inventory/adjustments
async function create(req, res, next) {
  try {
    const { warehouseId, reason, items, adjustmentDate, notes } = req.body;
    if (!warehouseId || !reason || !items?.length)
      return res.status(400).json({ data: null, message: 'warehouseId, reason and items required', errors: null });

    const adjNumber = await nextSeq(req.tenantId, 'ADJ');
    const adjItems = [];

    // Compute system qty for each item from stock ledger
    for (const item of items) {
      const agg = await StockLedger.aggregate([
        { $match: { tenantId: req.tenantId, productId: new mongoose.Types.ObjectId(item.productId), warehouseId: new mongoose.Types.ObjectId(warehouseId), ...(item.batchNo ? { batchNo: item.batchNo } : {}) } },
        { $group: { _id: null, total: { $sum: '$qty' } } },
      ]);
      const systemQty = agg[0]?.total || 0;
      adjItems.push({
        productId: item.productId,
        batchNo: item.batchNo || null,
        physicalQty: item.physicalQty,
        systemQty,
        differenceQty: item.physicalQty - systemQty,
        unitCost: item.unitCost || 0,
      });
    }

    const adj = await Adjustment.create({
      tenantId: req.tenantId,
      adjNumber,
      warehouseId,
      adjustmentDate: adjustmentDate || new Date(),
      reason,
      items: adjItems,
      notes,
      createdBy: req.user._id,
      status: 'APPROVED', // Auto-apply in simple mode
    });

    // Directly apply differences to ledger
    const ledgerEntries = adjItems
      .filter(i => i.differenceQty !== 0)
      .map(i => ({
        tenantId: req.tenantId,
        productId: i.productId,
        warehouseId: adj.warehouseId,
        txnType: 'ADJUSTMENT',
        refModel: 'InvAdjustment',
        refId: adj._id,
        date: adj.adjustmentDate,
        batchNo: i.batchNo,
        qty: i.differenceQty,
        unitCost: i.unitCost,
        totalCost: Math.abs(i.differenceQty * i.unitCost),
        remarks: `Adjustment ${adj.adjNumber}: ${adj.reason}`,
        createdBy: req.user._id,
      }));

    if (ledgerEntries.length) await StockLedger.insertMany(ledgerEntries);

    res.status(201).json({ data: adj, message: `Stock Adjustment ${adjNumber} applied successfully`, errors: null });
  } catch (e) {
    next(e);
  }
}

module.exports = { list, quickStock, create };
