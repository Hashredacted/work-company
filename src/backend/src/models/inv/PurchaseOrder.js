'use strict';

const mongoose = require('mongoose');

const LineItemSchema = new mongoose.Schema({
  productId:     { type: mongoose.Schema.Types.ObjectId, ref: 'InvProduct', required: true },
  description:   { type: String },
  quantity:      { type: Number, required: true, min: 0.001 },
  unit:          { type: String },
  unitPrice:     { type: Number, required: true, min: 0 },   // INR
  discountPct:   { type: Number, default: 0, min: 0, max: 100 },
  taxableAmount: { type: Number, default: 0 },
  gstRate:       { type: Number, default: 0 },
  cessRate:      { type: Number, default: 0 },
  cgst:          { type: Number, default: 0 },
  sgst:          { type: Number, default: 0 },
  igst:          { type: Number, default: 0 },
  cess:          { type: Number, default: 0 },
  lineTotal:     { type: Number, default: 0 },
}, { _id: false });

const PurchaseOrderSchema = new mongoose.Schema({
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  poNumber:    { type: String, required: true }, // PO-2526-0001
  supplierId:  { type: mongoose.Schema.Types.ObjectId, ref: 'InvSupplier', required: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvWarehouse', required: true },
  status: {
    type: String,
    enum: ['DRAFT', 'CONFIRMED', 'PARTIAL', 'RECEIVED', 'CANCELLED'],
    default: 'DRAFT',
  },
  orderDate:            { type: Date, default: Date.now },
  expectedDeliveryDate: { type: Date },
  isInterstate:         { type: Boolean, default: false }, // drives CGST/SGST vs IGST

  items: [LineItemSchema],

  // Totals (INR)
  subtotal:       { type: Number, default: 0 },
  totalDiscount:  { type: Number, default: 0 },
  totalTaxable:   { type: Number, default: 0 },
  totalCgst:      { type: Number, default: 0 },
  totalSgst:      { type: Number, default: 0 },
  totalIgst:      { type: Number, default: 0 },
  totalCess:      { type: Number, default: 0 },
  grandTotal:     { type: Number, default: 0 },

  notes: { type: String },
  terms: { type: String },
  cancelReason: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

PurchaseOrderSchema.index({ tenantId: 1, status: 1 });
PurchaseOrderSchema.index({ tenantId: 1, supplierId: 1 });
PurchaseOrderSchema.index({ tenantId: 1, poNumber: 1 }, { unique: true });

module.exports = mongoose.model('InvPurchaseOrder', PurchaseOrderSchema);
