'use strict';

const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema(
  {
    tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    planId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
    status: {
      type: String,
      enum: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'],
      default: 'ACTIVE',
    },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd:   { type: Date, required: true },
    cancelledAt:   { type: Date },
    cancelReason:  { type: String },
    autoRenew:     { type: Boolean, default: true },
    trialEnd:      { type: Date },
  },
  { timestamps: true }
);

SubscriptionSchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model('Subscription', SubscriptionSchema);
