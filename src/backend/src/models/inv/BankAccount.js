'use strict';

const mongoose = require('mongoose');
const { encrypt, decrypt, blindIndex, mask } = require('../../utils/encryption');

const BankAccountSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    bankName: {
      type: String,
      required: true,
      trim: true, // e.g. 'HDFC Bank', 'State Bank of India', 'ICICI Bank'
    },
    accountName: {
      type: String,
      required: true,
      trim: true, // e.g. 'Main Business Current Account', 'Vendor Payout Account'
    },
    // AES-256-GCM Encrypted at rest
    accountNumber: {
      type: String,
      required: true,
      trim: true,
      set: (val) => (val ? encrypt(val.trim()) : val),
      get: (val) => (val ? decrypt(val) : val),
    },
    // Deterministic HMAC-SHA-256 blind index for unique querying without revealing plaintext
    accountNumberHash: {
      type: String,
      index: true,
    },
    // Safe masked representation for zero-leak frontend rendering
    accountNumberMasked: {
      type: String,
      default: '',
    },
    ifscCode: {
      type: String,
      trim: true,
      uppercase: true, // e.g. 'HDFC0001234'
    },
    branchName: {
      type: String,
      trim: true, // e.g. 'MG Road, Bengaluru'
    },
    accountType: {
      type: String,
      enum: ['CURRENT', 'SAVINGS', 'OVERDRAFT', 'CASH_CREDIT', 'VIRTUAL'],
      default: 'CURRENT',
    },
    upiId: {
      type: String,
      trim: true, // e.g. 'company@hdfcbank'
      set: (val) => (val ? encrypt(val.trim()) : val),
      get: (val) => (val ? decrypt(val) : val),
    },
    openingBalance: {
      type: Number,
      default: 0,
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

// Synchronize blind index and masked preview before saving
BankAccountSchema.pre('save', function (next) {
  if (this.isModified('accountNumber') || !this.accountNumberHash) {
    const raw = decrypt(this.accountNumber);
    this.accountNumberHash = blindIndex(raw);
    this.accountNumberMasked = mask(raw, 4);
  }
  if (typeof next === 'function') next();
});

BankAccountSchema.index({ tenantId: 1, accountNumberHash: 1, deletedAt: 1 });
BankAccountSchema.index({ tenantId: 1, isActive: 1 });

module.exports = mongoose.model('InvBankAccount', BankAccountSchema);
