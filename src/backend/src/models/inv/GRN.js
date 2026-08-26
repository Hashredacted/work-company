'use strict';

const mongoose = require('mongoose');

const GRNItemSchema = new mongoose.Schema({
  productId:    { type: mongoose.Schema.Types.ObjectId, ref: 'InvProduct', required: true },
  orderedQty:   { type: Number, default: 0 },
  receivedQty:  { type: Number, required: true, min: 0 },
  rejectedQty:  { type: Number, default: 0 },
  unitPrice:    { type: Number, default: 0 },
  // Batch tracking fields
  batchNo:      { type: String, trim: true, default: null },
  expiryDate:   { type: Date, default: null },
  // Serial tracking: array of serial numbers received
  serialNumbers: [{ type: String, trim: true }],
}, { _id: false });

const GRNSchema = new mongoose.Schema({
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  grnNumber:   { type: String, required: true },
  poId:        { type: mongoose.Schema.Types.ObjectId, ref: 'InvPurchaseOrder', default: null },
  supplierId:  { type: mongoose.Schema.Types.ObjectId, ref: 'InvSupplier', required: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvWarehouse', required: true },
  status:      { type: String, enum: ['PENDING', 'PARTIAL', 'COMPLETE'], default: 'PENDING' },
  receivedDate: { type: Date, default: Date.now },
  vehicleNo:    { type: String, trim: true },
  ewayBillNo:   { type: String, trim: true },
  items:        [GRNItemSchema],
  notes:        { type: String },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

GRNSchema.index({ tenantId: 1, grnNumber: 1 }, { unique: true });
GRNSchema.index({ tenantId: 1, poId: 1 });

module.exports = mongoose.model('InvGRN', GRNSchema);
