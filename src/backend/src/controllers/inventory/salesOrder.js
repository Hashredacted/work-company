'use strict';

const SO          = require('../../models/inv/SalesOrder');
const Product     = require('../../models/inv/Product');
const Customer    = require('../../models/inv/Customer');
const Warehouse   = require('../../models/inv/Warehouse');
const StockLedger = require('../../models/inv/StockLedger');
const SerialNum   = require('../../models/inv/SerialNumber');
const AuditLog    = require('../../models/AuditLog');
const { calcLine, sumOrder, isInterstate: checkInterstate } = require('../../utils/gst');
const { nextSeq } = require('../../utils/sequence');

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getStock(tenantId, productId, warehouseId) {
  const res = await StockLedger.aggregate([
    { $match: { tenantId, productId, warehouseId } },
    { $group: { _id: null, total: { $sum: '$qty' } } },
  ]);
  return res[0]?.total || 0;
}

// ─── LIST ─────────────────────────────────────────────────────────────────────

async function list(req, res, next) {
  try {
    const { status, page = 1, limit = 30, search } = req.query;
    const filter = { tenantId: req.tenantId };
    if (status) filter.status = status;
    if (search) filter.soNumber = { $regex: search, $options: 'i' };
    const skip = (Number(page) - 1) * Number(limit);
    const [sos, total] = await Promise.all([
      SO.find(filter).populate('customerId', 'name gstin').populate('warehouseId', 'name code').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      SO.countDocuments(filter),
    ]);
    res.json({ data: { sos, total }, message: 'OK', errors: null });
  } catch (e) { next(e); }
}

// ─── GET ONE ──────────────────────────────────────────────────────────────────

async function getOne(req, res, next) {
  try {
    const so = await SO.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('customerId').populate('warehouseId').populate('items.productId', 'name sku unit trackingType').lean();
    if (!so) return res.status(404).json({ data: null, message: 'SO not found', errors: null });
    res.json({ data: so, message: 'OK', errors: null });
  } catch (e) { next(e); }
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

async function create(req, res, next) {
  try {
    const { customerId, warehouseId, items, orderDate, deliveryDate, notes, terms } = req.body;
    if (!customerId || !warehouseId || !items?.length)
      return res.status(400).json({ data: null, message: 'customerId, warehouseId and items are required', errors: null });

    const [customer, warehouse] = await Promise.all([
      Customer.findOne({ _id: customerId, tenantId: req.tenantId }),
      Warehouse.findOne({ _id: warehouseId, tenantId: req.tenantId }),
    ]);
    if (!customer) return res.status(404).json({ data: null, message: 'Customer not found', errors: null });
    if (!warehouse) return res.status(404).json({ data: null, message: 'Warehouse not found', errors: null });

    const interstate = checkInterstate(warehouse.stateCode, customer.stateCode);
    const lines = [];
    for (const item of items) {
      const prod = await Product.findOne({ _id: item.productId, tenantId: req.tenantId, deletedAt: null });
      if (!prod) return res.status(400).json({ data: null, message: `Product not found: ${item.productId}`, errors: null });
      const calc = calcLine(item.unitPrice, item.quantity, item.discountPct || 0, prod.gstRate, prod.cessRate || 0, interstate);
      lines.push({ productId: prod._id, description: item.description || prod.name, quantity: item.quantity, unit: item.unit || prod.unit, unitPrice: item.unitPrice, discountPct: item.discountPct || 0, gstRate: prod.gstRate, cessRate: prod.cessRate || 0, ...calc });
    }

    const totals = sumOrder(lines);
    const soNumber = await nextSeq(req.tenantId, 'SO');
    const so = await SO.create({ tenantId: req.tenantId, soNumber, customerId, warehouseId, isInterstate: interstate, orderDate, deliveryDate, items: lines, notes, terms, createdBy: req.user._id, ...totals });
    res.status(201).json({ data: so, message: `SO ${soNumber} created`, errors: null });
  } catch (e) { next(e); }
}

// ─── CONFIRM ──────────────────────────────────────────────────────────────────

async function confirm(req, res, next) {
  try {
    const so = await SO.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!so) return res.status(404).json({ data: null, message: 'SO not found', errors: null });
    if (so.status !== 'DRAFT') return res.status(400).json({ data: null, message: 'Only DRAFT SOs can be confirmed', errors: null });
    so.status = 'CONFIRMED';
    await so.save();
    res.json({ data: so, message: 'SO confirmed', errors: null });
  } catch (e) { next(e); }
}

// ─── DISPATCH ─────────────────────────────────────────────────────────────────

async function dispatch(req, res, next) {
  try {
    const so = await SO.findOne({ _id: req.params.id, tenantId: req.tenantId }).populate('items.productId');
    if (!so) return res.status(404).json({ data: null, message: 'SO not found', errors: null });
    if (!['CONFIRMED', 'PARTIAL'].includes(so.status))
      return res.status(400).json({ data: null, message: 'SO must be CONFIRMED to dispatch', errors: null });

    const { items, ewayBillNo } = req.body; // items: [{productId, dispatchQty, batchNo, serialNumbers}]
    if (!items?.length) return res.status(400).json({ data: null, message: 'items required for dispatch', errors: null });

    const ledgerEntries = [];
    for (const dItem of items) {
      const soLine = so.items.find(l => l.productId._id.toString() === dItem.productId);
      if (!soLine) return res.status(400).json({ data: null, message: `Product ${dItem.productId} not in SO`, errors: null });
      const prod = soLine.productId;

      // Stock availability check
      const available = await getStock(req.tenantId, prod._id, so.warehouseId);
      if (available < dItem.dispatchQty)
        return res.status(400).json({ data: null, message: `Insufficient stock for ${prod.name}: available ${available}, requested ${dItem.dispatchQty}`, errors: null });

      if (prod.trackingType === 'BATCH' && !dItem.batchNo)
        return res.status(400).json({ data: null, message: `Batch number required for ${prod.name}`, errors: null });
      if (prod.trackingType === 'SERIAL' && dItem.serialNumbers?.length !== dItem.dispatchQty)
        return res.status(400).json({ data: null, message: `${dItem.dispatchQty} serial numbers required for ${prod.name}`, errors: null });

      soLine.dispatchedQty = (soLine.dispatchedQty || 0) + dItem.dispatchQty;
      soLine.batchNo = dItem.batchNo || null;
      soLine.serialNumbers = dItem.serialNumbers || [];

      ledgerEntries.push({ tenantId: req.tenantId, productId: prod._id, warehouseId: so.warehouseId, txnType: 'SO_DISPATCH', refModel: 'InvSalesOrder', refId: so._id, date: new Date(), batchNo: dItem.batchNo || null, serialNumbers: dItem.serialNumbers || [], qty: -dItem.dispatchQty, unitCost: soLine.unitPrice, totalCost: soLine.unitPrice * dItem.dispatchQty, remarks: `Dispatch against ${so.soNumber}`, createdBy: req.user._id });

      // Mark serials as SOLD
      if (prod.trackingType === 'SERIAL' && dItem.serialNumbers?.length) {
        await SerialNum.updateMany({ tenantId: req.tenantId, productId: prod._id, serialNo: { $in: dItem.serialNumbers } }, { status: 'SOLD', soId: so._id });
      }
    }

    await StockLedger.insertMany(ledgerEntries);
    if (ewayBillNo) so.ewayBillNo = ewayBillNo;
    so.status = 'DISPATCHED';
    so.markModified('items');
    await so.save();

    await AuditLog.create({ tenantId: req.tenantId, userId: req.user._id, action: 'SO_DISPATCHED', resource: 'inventory', resourceId: so._id.toString(), details: { soNumber: so.soNumber }, ip: req.ip });

    res.json({ data: so, message: 'Dispatched & stock updated', errors: null });
  } catch (e) { next(e); }
}

// ─── RECORD PAYMENT ───────────────────────────────────────────────────────────

async function recordPayment(req, res, next) {
  try {
    const { amount } = req.body;
    const so = await SO.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!so) return res.status(404).json({ data: null, message: 'SO not found', errors: null });
    so.amountPaid = Math.min((so.amountPaid || 0) + Number(amount), so.grandTotal);
    so.paymentStatus = so.amountPaid >= so.grandTotal ? 'PAID' : so.amountPaid > 0 ? 'PARTIAL' : 'UNPAID';
    await so.save();
    res.json({ data: so, message: 'Payment recorded', errors: null });
  } catch (e) { next(e); }
}

// ─── CANCEL ───────────────────────────────────────────────────────────────────

async function cancel(req, res, next) {
  try {
    const so = await SO.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!so) return res.status(404).json({ data: null, message: 'SO not found', errors: null });
    if (['DISPATCHED', 'DELIVERED', 'CANCELLED'].includes(so.status))
      return res.status(400).json({ data: null, message: 'Cannot cancel this SO', errors: null });
    so.status = 'CANCELLED';
    so.cancelReason = req.body.reason || '';
    await so.save();
    res.json({ data: so, message: 'SO cancelled', errors: null });
  } catch (e) { next(e); }
}

module.exports = { list, getOne, create, confirm, dispatch, recordPayment, cancel };
