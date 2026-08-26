'use strict';

const mongoose = require('mongoose');

const SOLineSchema = new mongoose.Schema({
  productId:     { type: mongoose.Schema.Types.ObjectId, ref: 'InvProduct', required: true },
  description:   { type: String },
  quantity:      { type: Number, required: true, min: 0.001 },
  dispatchedQty: { type: Number, default: 0 },
  unit:          { type: String },
  unitPrice:     { type: Number, required: true, min: 0 },
  discountPct:   { type: Number, default: 0, min: 0, max: 100 },
  taxableAmount: { type: Number, default: 0 },
  gstRate:       { type: Number, default: 0 },
  cessRate:      { type: Number, default: 0 },
  cgst:          { type: Number, default: 0 },
  sgst:          { type: Number, default: 0 },
  igst:          { type: Number, default: 0 },
  cess:          { type: Number, default: 0 },
  lineTotal:     { type: Number, default: 0 },
  // Dispatch details (set at dispatch time)
  batchNo:       { type: String, default: null },
  serialNumbers: [{ type: String }],
}, { _id: false });

const SalesOrderSchema = new mongoose.Schema({
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  soNumber:    { type: String, required: true },
  customerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'InvCustomer', required: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvWarehouse', required: true },
  status: {
    type: String,
    enum: ['DRAFT', 'CONFIRMED', 'PARTIAL', 'DISPATCHED', 'DELIVERED', 'CANCELLED'],
    default: 'DRAFT',
  },
  orderDate:    { type: Date, default: Date.now },
  deliveryDate: { type: Date },
  isInterstate: { type: Boolean, default: false },
  ewayBillNo:   { type: String, trim: true },

  items: [SOLineSchema],

  subtotal:      { type: Number, default: 0 },
  totalDiscount: { type: Number, default: 0 },
  totalTaxable:  { type: Number, default: 0 },
  totalCgst:     { type: Number, default: 0 },
  totalSgst:     { type: Number, default: 0 },
  totalIgst:     { type: Number, default: 0 },
  totalCess:     { type: Number, default: 0 },
  grandTotal:    { type: Number, default: 0 },

  paymentStatus: { type: String, enum: ['UNPAID', 'PARTIAL', 'PAID'], default: 'UNPAID' },
  amountPaid:    { type: Number, default: 0 },

  notes:        { type: String },
  terms:        { type: String },
  cancelReason: { type: String },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

SalesOrderSchema.index({ tenantId: 1, soNumber: 1 }, { unique: true });
SalesOrderSchema.index({ tenantId: 1, customerId: 1 });
SalesOrderSchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model('InvSalesOrder', SalesOrderSchema);
