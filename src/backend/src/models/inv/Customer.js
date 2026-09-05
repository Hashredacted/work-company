'use strict';

const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../../utils/encryption');

const CustomerSchema = new mongoose.Schema({
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name:        { type: String, required: true, trim: true },
  gstin:       { type: String, trim: true, uppercase: true, default: null },
  pan:         {
    type: String,
    trim: true,
    default: null,
    get: (val) => (val ? decrypt(val) : val),
  }, // 10-char PAN (Encrypted at rest)
  contactName: { type: String, trim: true },
  phone:       { type: String, trim: true },
  email:       { type: String, trim: true, lowercase: true },
  billingAddress:  { type: String, trim: true },
  shippingAddress: { type: String, trim: true },
  city:        { type: String, trim: true },
  state:       { type: String, trim: true },
  stateCode:   { type: String, trim: true }, // 2-digit GST state code
  pincode:     { type: String, trim: true },
  paymentTerms: { type: Number, default: 0 },   // days; 0 = cash
  creditLimit:  { type: Number, default: 0 },   // INR
  advanceBalance: { type: Number, default: 0, min: 0 }, // Accumulated unallocated advance credit (INR)
  notes:    { type: String },
  isActive: { type: Boolean, default: true },
  deletedAt:{ type: Date, default: null },
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true },
});

// Pre-save hook to ensure robust field-level encryption at rest
CustomerSchema.pre('save', function (next) {
  if (this.pan && !this.pan.startsWith('enc:v1:')) {
    this.pan = encrypt(this.pan.toUpperCase());
  }
  if (typeof next === 'function') next();
});

CustomerSchema.index({ tenantId: 1, isActive: 1 });
CustomerSchema.index({ tenantId: 1, gstin: 1 });

module.exports = mongoose.model('InvCustomer', CustomerSchema);
