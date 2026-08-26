'use strict';

const Product     = require('../../models/inv/Product');
const StockLedger = require('../../models/inv/StockLedger');

// GET /api/inventory/products
async function list(req, res, next) {
  try {
    const { search, categoryId, trackingType, active = 'true', page = 1, limit = 50 } = req.query;
    const filter = { tenantId: req.tenantId, deletedAt: null };
    if (active === 'true') filter.isActive = true;
    if (categoryId) {
      const Category = require('../../models/inv/Category');
      const subCats = await Category.find({ tenantId: req.tenantId, parentId: categoryId, deletedAt: null }).select('_id');
      const catIds = [categoryId, ...subCats.map(s => s._id)];
      filter.categoryId = { $in: catIds };
    }
    if (trackingType) filter.trackingType = trackingType;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { sku:  { $regex: search, $options: 'i' } },
      { barcode: { $regex: search, $options: 'i' } },
    ];

    const skip = (Number(page) - 1) * Number(limit);
    const [products, total] = await Promise.all([
      Product.find(filter).populate('categoryId', 'name icon defaultHsn defaultGstRate').sort({ name: 1 }).skip(skip).limit(Number(limit)).lean(),
      Product.countDocuments(filter),
    ]);

    // Attach current stock (sum across all warehouses)
    const productIds = products.map(p => p._id);
    const stockAgg = await StockLedger.aggregate([
      { $match: { tenantId: req.tenantId, productId: { $in: productIds } } },
      { $group: { _id: '$productId', currentStock: { $sum: '$qty' } } },
    ]);
    const stockMap = Object.fromEntries(stockAgg.map(s => [s._id.toString(), s.currentStock]));
    const result = products.map(p => ({ ...p, currentStock: stockMap[p._id.toString()] || 0 }));

    res.json({ data: { products: result, total, page: Number(page) }, message: 'OK', errors: null });
  } catch (e) { next(e); }
}

// GET /api/inventory/products/low-stock
async function lowStock(req, res, next) {
  try {
    const products = await Product.find({ tenantId: req.tenantId, deletedAt: null, isActive: true, reorderLevel: { $gt: 0 } }).lean();
    const ids = products.map(p => p._id);
    const stockAgg = await StockLedger.aggregate([
      { $match: { tenantId: req.tenantId, productId: { $in: ids } } },
      { $group: { _id: '$productId', currentStock: { $sum: '$qty' } } },
    ]);
    const stockMap = Object.fromEntries(stockAgg.map(s => [s._id.toString(), s.currentStock]));
    const alerts = products
      .map(p => ({ ...p, currentStock: stockMap[p._id.toString()] || 0 }))
      .filter(p => p.currentStock <= p.reorderLevel);
    res.json({ data: alerts, message: 'OK', errors: null });
  } catch (e) { next(e); }
}

// GET /api/inventory/products/:id
async function getOne(req, res, next) {
  try {
    const p = await Product.findOne({ _id: req.params.id, tenantId: req.tenantId, deletedAt: null })
      .populate('categoryId', 'name').lean();
    if (!p) return res.status(404).json({ data: null, message: 'Product not found', errors: null });

    // Stock breakdown by warehouse
    const stockAgg = await StockLedger.aggregate([
      { $match: { tenantId: req.tenantId, productId: p._id } },
      { $group: { _id: { warehouseId: '$warehouseId', batchNo: '$batchNo', expiryDate: '$expiryDate' }, qty: { $sum: '$qty' } } },
    ]);
    res.json({ data: { ...p, stockBreakdown: stockAgg }, message: 'OK', errors: null });
  } catch (e) { next(e); }
}

// POST /api/inventory/products
async function create(req, res, next) {
  try {
    const { name, sku, ...rest } = req.body;
    if (!name || !sku) return res.status(400).json({ data: null, message: 'name and sku are required', errors: null });
    const exists = await Product.findOne({ tenantId: req.tenantId, sku });
    if (exists) return res.status(409).json({ data: null, message: `SKU "${sku}" already exists`, errors: null });
    const p = await Product.create({ tenantId: req.tenantId, name, sku, ...rest });
    res.status(201).json({ data: p, message: 'Product created', errors: null });
  } catch (e) { next(e); }
}

// PUT /api/inventory/products/:id
async function update(req, res, next) {
  try {
    const p = await Product.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, deletedAt: null },
      { $set: req.body },
      { new: true }
    );
    if (!p) return res.status(404).json({ data: null, message: 'Product not found', errors: null });
    res.json({ data: p, message: 'Updated', errors: null });
  } catch (e) { next(e); }
}

// DELETE /api/inventory/products/:id
async function remove(req, res, next) {
  try {
    await Product.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { deletedAt: new Date(), isActive: false }
    );
    res.json({ data: null, message: 'Product deleted', errors: null });
  } catch (e) { next(e); }
}

module.exports = { list, lowStock, getOne, create, update, remove };
