'use strict';

const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  tenantId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name:            { type: String, required: true, trim: true },
  code:            { type: String, trim: true, uppercase: true },
  parentId:        { type: mongoose.Schema.Types.ObjectId, ref: 'InvCategory', default: null, index: true },
  description:     { type: String, trim: true },
  defaultHsn:      { type: String, trim: true },
  defaultGstRate:  { type: Number, default: 18 },
  defaultCessRate: { type: Number, default: 0 },
  icon:            { type: String, trim: true, default: '📦' },
  sortOrder:       { type: Number, default: 0 },
  isActive:        { type: Boolean, default: true },
  deletedAt:       { type: Date, default: null },
}, { timestamps: true });

CategorySchema.index({ tenantId: 1, name: 1, deletedAt: 1 });
CategorySchema.index({ tenantId: 1, parentId: 1, deletedAt: 1 });

module.exports = mongoose.model('InvCategory', CategorySchema);
