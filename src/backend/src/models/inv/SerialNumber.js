'use strict';

const mongoose = require('mongoose');

// Tracks individual serial numbers — one document per serial
const SerialNumberSchema = new mongoose.Schema({
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'InvProduct', required: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvWarehouse', required: true },
  serialNo:    { type: String, required: true, trim: true },
  status:      { type: String, enum: ['AVAILABLE', 'SOLD', 'DAMAGED', 'RETURNED'], default: 'AVAILABLE' },
  grnId:       { type: mongoose.Schema.Types.ObjectId, ref: 'InvGRN', default: null },
  soId:        { type: mongoose.Schema.Types.ObjectId, ref: 'InvSalesOrder', default: null },
}, { timestamps: true });

SerialNumberSchema.index({ tenantId: 1, productId: 1, serialNo: 1 }, { unique: true });
SerialNumberSchema.index({ tenantId: 1, productId: 1, status: 1 });

module.exports = mongoose.model('InvSerialNumber', SerialNumberSchema);
