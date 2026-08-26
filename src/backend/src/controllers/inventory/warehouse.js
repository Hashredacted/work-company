'use strict';

const Warehouse    = require('../../models/inv/Warehouse');
const StockLedger  = require('../../models/inv/StockLedger');

async function list(req, res, next) {
  try {
    const whs = await Warehouse.find({ tenantId: req.tenantId, isActive: true }).sort({ isDefault: -1, name: 1 }).lean();
    res.json({ data: whs, message: 'OK', errors: null });
  } catch (e) { next(e); }
}

async function create(req, res, next) {
  try {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ data: null, message: 'name and code are required', errors: null });
    const exists = await Warehouse.findOne({ tenantId: req.tenantId, code: code.toUpperCase() });
    if (exists) return res.status(409).json({ data: null, message: `Code "${code}" already exists`, errors: null });
    // If this is the first warehouse, make it default
    const count = await Warehouse.countDocuments({ tenantId: req.tenantId });
    const wh = await Warehouse.create({ tenantId: req.tenantId, ...req.body, code: code.toUpperCase(), isDefault: count === 0 });
    res.status(201).json({ data: wh, message: 'Warehouse created', errors: null });
  } catch (e) { next(e); }
}

async function update(req, res, next) {
  try {
    const wh = await Warehouse.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { $set: req.body }, { new: true });
    if (!wh) return res.status(404).json({ data: null, message: 'Not found', errors: null });
    res.json({ data: wh, message: 'Updated', errors: null });
  } catch (e) { next(e); }
}

async function remove(req, res, next) {
  try {
    await Warehouse.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { isActive: false });
    res.json({ data: null, message: 'Deleted', errors: null });
  } catch (e) { next(e); }
}

// GET /api/inventory/warehouses/:id/stock — current stock at this warehouse
async function stockAtWarehouse(req, res, next) {
  try {
    const stock = await StockLedger.aggregate([
      { $match: { tenantId: req.tenantId, warehouseId: req.params.id } },
      { $group: { _id: { productId: '$productId', batchNo: '$batchNo' }, qty: { $sum: '$qty' } } },
      { $match: { qty: { $gt: 0 } } },
    ]);
    res.json({ data: stock, message: 'OK', errors: null });
  } catch (e) { next(e); }
}

module.exports = { list, create, update, remove, stockAtWarehouse };
