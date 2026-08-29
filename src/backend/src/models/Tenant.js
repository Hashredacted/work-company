'use strict';

const mongoose = require('mongoose');

const TenantSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone:    { type: String, trim: true },
    address:      { type: String, trim: true },
    city:         { type: String, trim: true },
    state:        { type: String, trim: true },
    stateCode:    { type: String, trim: true },
    pincode:      { type: String, trim: true },
    businessType: { type: String, trim: true, default: 'Retail & Wholesale' },
    gst:          { type: String, trim: true },
    license:      { type: String, trim: true },
    status: {
      type: String,
      enum: ['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'],
      default: 'TRIAL',
    },
    trialStartedAt:  { type: Date },
    trialEndsAt:     { type: Date },
    planId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
    subscriptionId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },
    initialWorkingCapital: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Index for status queries
TenantSchema.index({ status: 1 });
TenantSchema.index({ planId: 1 });

module.exports = mongoose.model('Tenant', TenantSchema);

