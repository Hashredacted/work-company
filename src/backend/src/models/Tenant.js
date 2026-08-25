'use strict';

const mongoose = require('mongoose');

const TenantSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone:    { type: String, trim: true },
    address:  { type: String, trim: true },
    gst:      { type: String, trim: true },
    license:  { type: String, trim: true },
    status: {
      type: String,
      enum: ['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED'],
      default: 'TRIAL',
    },
    trialStartedAt:  { type: Date },
    trialEndsAt:     { type: Date },
    planId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
    subscriptionId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },
  },
  { timestamps: true }
);

// Index for status queries
TenantSchema.index({ status: 1 });
TenantSchema.index({ planId: 1 });

module.exports = mongoose.model('Tenant', TenantSchema);

