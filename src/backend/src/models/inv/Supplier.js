'use strict';

const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../../utils/encryption');

// Indian state codes (2-digit as per GST)
const SupplierSchema = new mongoose.Schema({
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name:        { type: String, required: true, trim: true },
  gstin:       { type: String, trim: true, uppercase: true, default: null }, // 15-char GSTIN
  pan:         {
    type: String,
    trim: true,
    default: null,
    get: (val) => (val ? decrypt(val) : val),
  }, // 10-char PAN (Encrypted at rest)
  contactName: { type: String, trim: true },
  phone:       { type: String, trim: true },
  email:       { type: String, trim: true, lowercase: true },
  address:     { type: String, trim: true },
  city:        { type: String, trim: true },
  state:       { type: String, trim: true },
  stateCode:   { type: String, trim: true }, // 2-digit GST state code e.g. "27" for Maharashtra
  pincode:     { type: String, trim: true },
  paymentTerms: { type: Number, default: 30 }, // days
  creditLimit:  { type: Number, default: 0 },  // INR
  bankDetails: {
    accountNo: {
      type: String,
      get: (val) => (val ? decrypt(val) : val),
    },
    ifsc:      { type: String, uppercase: true },
    bankName:  { type: String },
    branch:    { type: String },
  },
  notes:    { type: String },
  isActive: { type: Boolean, default: true },
  deletedAt:{ type: Date, default: null },
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true },
});

// Pre-save hook to ensure robust field-level encryption at rest
SupplierSchema.pre('save', function (next) {
  if (this.pan && !this.pan.startsWith('enc:v1:')) {
    this.pan = encrypt(this.pan.toUpperCase());
  }
  if (this.bankDetails && this.bankDetails.accountNo && !this.bankDetails.accountNo.startsWith('enc:v1:')) {
    this.bankDetails.accountNo = encrypt(this.bankDetails.accountNo);
  }
  if (typeof next === 'function') next();
});

SupplierSchema.index({ tenantId: 1, isActive: 1 });
SupplierSchema.index({ tenantId: 1, gstin: 1 });

module.exports = mongoose.model('InvSupplier', SupplierSchema);
