'use strict';

const mongoose = require('mongoose');

const AdjItemSchema = new mongoose.Schema({
  productId:    { type: mongoose.Schema.Types.ObjectId, ref: 'InvProduct', required: true },
  batchNo:      { type: String, default: null },
  physicalQty:  { type: Number, required: true, min: 0 },  // actual counted qty
  systemQty:    { type: Number, required: true },           // qty per system records
  differenceQty:{ type: Number, required: true },           // physicalQty - systemQty
  unitCost:     { type: Number, default: 0 },
}, { _id: false });

const AdjustmentSchema = new mongoose.Schema({
  tenantId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  adjNumber:      { type: String, required: true },
  warehouseId:    { type: mongoose.Schema.Types.ObjectId, ref: 'InvWarehouse', required: true },
  adjustmentDate: { type: Date, default: Date.now },
  reason: {
    type: String,
    enum: ['DAMAGE', 'EXPIRY', 'THEFT', 'COUNT_ERROR', 'SAMPLE', 'OTHER'],
    required: true,
  },
  items:      [AdjItemSchema],
  status:     { type: String, enum: ['DRAFT', 'APPROVED'], default: 'DRAFT' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  notes:      { type: String },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

AdjustmentSchema.index({ tenantId: 1, adjNumber: 1 }, { unique: true });

module.exports = mongoose.model('InvAdjustment', AdjustmentSchema);
