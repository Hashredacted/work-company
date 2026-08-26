'use strict';

const mongoose = require('mongoose');

// Indian standard units of measure
const UNITS = ['Pcs', 'Box', 'Carton', 'Dozen', 'Pair', 'Set',
               'Kg', 'g', 'Quintal', 'MT',
               'L', 'mL',
               'm', 'cm', 'ft',
               'sqm', 'sqft', 'Other'];

const GST_RATES = [0, 5, 12, 18, 28];

const ProductSchema = new mongoose.Schema({
  tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name:         { type: String, required: true, trim: true },
  sku:          { type: String, required: true, trim: true },
  barcode:      { type: String, trim: true, default: null },
  categoryId:   { type: mongoose.Schema.Types.ObjectId, ref: 'InvCategory', default: null },
  brand:        { type: String, trim: true },
  description:  { type: String },
  unit:         { type: String, enum: UNITS, required: true, default: 'Pcs' },

  // India-specific compliance fields
  hsnCode:      { type: String, trim: true },   // 4-8 digit HSN/SAC code
  gstRate:      { type: Number, enum: GST_RATES, default: 18 },   // %
  cessRate:     { type: Number, default: 0 },   // % cess (tobacco, luxury)

  // Pricing (INR)
  mrp:           { type: Number, default: 0 },   // Maximum Retail Price
  purchasePrice: { type: Number, default: 0 },
  sellingPrice:  { type: Number, default: 0 },

  // Tracking type
  trackingType: {
    type: String,
    enum: ['NONE', 'BATCH', 'SERIAL'],
    default: 'NONE',
  },

  // Stock control
  reorderLevel:   { type: Number, default: 0 },
  reorderQty:     { type: Number, default: 0 },
  maxStockLevel:  { type: Number, default: 0 },

  isActive: { type: Boolean, default: true },
  deletedAt:{ type: Date, default: null },
}, { timestamps: true });

// SKU must be unique per tenant
ProductSchema.index({ tenantId: 1, sku: 1 }, { unique: true });
ProductSchema.index({ tenantId: 1, categoryId: 1 });
ProductSchema.index({ tenantId: 1, isActive: 1 });

module.exports = mongoose.model('InvProduct', ProductSchema);
