'use strict';

const mongoose = require('mongoose');

const WarehouseSchema = new mongoose.Schema({
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name:        { type: String, required: true, trim: true },
  code:        { type: String, required: true, trim: true, uppercase: true }, // short code e.g. WH-MUM-01
  type:        { type: String, enum: ['OWNED', 'RENTED', '3PL'], default: 'OWNED' },
  address:     { type: String, trim: true },
  city:        { type: String, trim: true },
  state:       { type: String, trim: true },
  stateCode:   { type: String, trim: true },
  pincode:     { type: String, trim: true },
  managerName: { type: String, trim: true },
  phone:       { type: String, trim: true },
  isDefault:   { type: Boolean, default: false },
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

WarehouseSchema.index({ tenantId: 1, code: 1 }, { unique: true });
WarehouseSchema.index({ tenantId: 1, isDefault: 1 });

module.exports = mongoose.model('InvWarehouse', WarehouseSchema);
