'use strict';

const mongoose    = require('mongoose');
const PO          = require('../../models/inv/PurchaseOrder');
const GRN         = require('../../models/inv/GRN');
const Product     = require('../../models/inv/Product');
const Supplier    = require('../../models/inv/Supplier');
const Warehouse   = require('../../models/inv/Warehouse');
const Tenant      = require('../../models/Tenant');
const StockLedger = require('../../models/inv/StockLedger');
const SerialNum   = require('../../models/inv/SerialNumber');
const AuditLog    = require('../../models/AuditLog');
const { calcLine, sumOrder, isInterstate: checkInterstate } = require('../../utils/gst');
const { nextSeq } = require('../../utils/sequence');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function buildLines(tenantId, rawItems, interstate) {
  const lines = [];
  for (const item of rawItems) {
    const prod = await Product.findOne({ _id: item.productId, tenantId, deletedAt: null });
    if (!prod) throw Object.assign(new Error(`Product not found: ${item.productId}`), { status: 400 });
    const calc = calcLine(item.unitPrice, item.quantity, item.discountPct || 0, prod.gstRate, prod.cessRate || 0, interstate);
    lines.push({ productId: prod._id, description: item.description || prod.name, quantity: item.quantity, unit: item.unit || prod.unit, unitPrice: item.unitPrice, discountPct: item.discountPct || 0, gstRate: prod.gstRate, cessRate: prod.cessRate || 0, ...calc });
  }
  return lines;
}

// ─── LIST ─────────────────────────────────────────────────────────────────────

async function list(req, res, next) {
  try {
    const { status, page = 1, limit = 30, search } = req.query;
    const filter = { tenantId: req.tenantId };
    if (status) filter.status = status;
    if (search) filter.poNumber = { $regex: search, $options: 'i' };
    const skip = (Number(page) - 1) * Number(limit);
    const [pos, total] = await Promise.all([
      PO.find(filter).populate('supplierId', 'name gstin').populate('warehouseId', 'name code').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      PO.countDocuments(filter),
    ]);
    res.json({ data: { pos, total }, message: 'OK', errors: null });
  } catch (e) { next(e); }
}

// ─── GET ONE ──────────────────────────────────────────────────────────────────

async function getOne(req, res, next) {
  try {
    const po = await PO.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('supplierId').populate('warehouseId').populate('items.productId', 'name sku unit').lean();
    if (!po) return res.status(404).json({ data: null, message: 'PO not found', errors: null });
    res.json({ data: po, message: 'OK', errors: null });
  } catch (e) { next(e); }
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

async function create(req, res, next) {
  try {
    const { supplierId, warehouseId, items, orderDate, expectedDeliveryDate, notes, terms } = req.body;
    if (!supplierId || !warehouseId || !items?.length)
      return res.status(400).json({ data: null, message: 'supplierId, warehouseId and items are required', errors: null });

    const [supplier, warehouse, tenant] = await Promise.all([
      Supplier.findOne({ _id: supplierId, tenantId: req.tenantId }),
      Warehouse.findOne({ _id: warehouseId, tenantId: req.tenantId }),
      Tenant.findById(req.tenantId).lean(),
    ]);
    if (!supplier) return res.status(404).json({ data: null, message: 'Supplier not found', errors: null });
    if (!warehouse) return res.status(404).json({ data: null, message: 'Warehouse not found', errors: null });

    const interstate = checkInterstate(warehouse.stateCode, supplier.stateCode);
    const lines = await buildLines(req.tenantId, items, interstate);
    const totals = sumOrder(lines);
    const poNumber = await nextSeq(req.tenantId, 'PO');

    const po = await PO.create({
      tenantId: req.tenantId, poNumber, supplierId, warehouseId,
      isInterstate: interstate, orderDate, expectedDeliveryDate, items: lines,
      notes, terms, createdBy: req.user._id, ...totals,
    });

    res.status(201).json({ data: po, message: `PO ${poNumber} created`, errors: null });
  } catch (e) { next(e); }
}

// ─── CONFIRM ──────────────────────────────────────────────────────────────────

async function confirm(req, res, next) {
  try {
    const po = await PO.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!po) return res.status(404).json({ data: null, message: 'PO not found', errors: null });
    if (po.status !== 'DRAFT') return res.status(400).json({ data: null, message: 'Only DRAFT POs can be confirmed', errors: null });
    po.status = 'CONFIRMED';
    await po.save();
    res.json({ data: po, message: 'PO confirmed', errors: null });
  } catch (e) { next(e); }
}

// ─── CANCEL ───────────────────────────────────────────────────────────────────

async function cancel(req, res, next) {
  try {
    const po = await PO.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!po) return res.status(404).json({ data: null, message: 'PO not found', errors: null });
    if (['RECEIVED', 'CANCELLED'].includes(po.status))
      return res.status(400).json({ data: null, message: 'Cannot cancel a received or already cancelled PO', errors: null });
    po.status = 'CANCELLED';
    po.cancelReason = req.body.reason || '';
    await po.save();
    res.json({ data: po, message: 'PO cancelled', errors: null });
  } catch (e) { next(e); }
}

// ─── CREATE GRN (receive goods) ───────────────────────────────────────────────

async function createGRN(req, res, next) {
  try {
    const po = await PO.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!po) return res.status(404).json({ data: null, message: 'PO not found', errors: null });
    if (!['CONFIRMED', 'PARTIAL'].includes(po.status))
      return res.status(400).json({ data: null, message: 'PO must be CONFIRMED or PARTIAL to create GRN', errors: null });

    const { items, vehicleNo, ewayBillNo, receivedDate, notes } = req.body;
    if (!items?.length) return res.status(400).json({ data: null, message: 'items required', errors: null });

    const grnNumber = await nextSeq(req.tenantId, 'GRN');

    // Build GRN items and stock ledger entries
    const grnItems = [];
    const ledgerEntries = [];
    const serialDocs = [];

    for (const item of items) {
      const prod = await Product.findOne({ _id: item.productId, tenantId: req.tenantId, deletedAt: null });
      if (!prod) return res.status(400).json({ data: null, message: `Product ${item.productId} not found`, errors: null });

      if (prod.trackingType === 'BATCH' && !item.batchNo)
        return res.status(400).json({ data: null, message: `Batch number required for ${prod.name}`, errors: null });

      if (prod.trackingType === 'SERIAL' && (!item.serialNumbers || item.serialNumbers.length !== item.receivedQty))
        return res.status(400).json({ data: null, message: `${item.receivedQty} serial numbers required for ${prod.name}`, errors: null });

      grnItems.push({ productId: prod._id, orderedQty: item.orderedQty || 0, receivedQty: item.receivedQty, rejectedQty: item.rejectedQty || 0, unitPrice: item.unitPrice || 0, batchNo: item.batchNo || null, expiryDate: item.expiryDate || null, serialNumbers: item.serialNumbers || [] });

      ledgerEntries.push({ tenantId: req.tenantId, productId: prod._id, warehouseId: po.warehouseId, txnType: 'GRN', refModel: 'InvGRN', date: receivedDate || new Date(), batchNo: item.batchNo || null, expiryDate: item.expiryDate || null, serialNumbers: item.serialNumbers || [], qty: item.receivedQty, unitCost: item.unitPrice || 0, totalCost: (item.unitPrice || 0) * item.receivedQty, remarks: `GRN ${grnNumber}`, createdBy: req.user._id });

      if (prod.trackingType === 'SERIAL') {
        for (const sn of item.serialNumbers) {
          serialDocs.push({ tenantId: req.tenantId, productId: prod._id, warehouseId: po.warehouseId, serialNo: sn, status: 'AVAILABLE' });
        }
      }
    }

    const grn = await GRN.create({ tenantId: req.tenantId, grnNumber, poId: po._id, supplierId: po.supplierId, warehouseId: po.warehouseId, status: 'COMPLETE', receivedDate: receivedDate || new Date(), vehicleNo, ewayBillNo, items: grnItems, notes, createdBy: req.user._id });

    // Insert ledger entries (refId = grn._id)
    const withRef = ledgerEntries.map(e => ({ ...e, refId: grn._id }));
    await StockLedger.insertMany(withRef);
    if (serialDocs.length) await SerialNum.insertMany(serialDocs, { ordered: false });

    // Update PO status
    po.status = 'RECEIVED';
    await po.save();

    await AuditLog.create({ tenantId: req.tenantId, userId: req.user._id, action: 'GRN_CREATED', resource: 'inventory', resourceId: grn._id.toString(), details: { grnNumber, poNumber: po.poNumber }, ip: req.ip });

    res.status(201).json({ data: grn, message: `GRN ${grnNumber} created, stock updated`, errors: null });
  } catch (e) { next(e); }
}

module.exports = { list, getOne, create, confirm, cancel, createGRN };
