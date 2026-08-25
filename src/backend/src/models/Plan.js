'use strict';

const mongoose = require('mongoose');

const PlanSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, required: true },
    description: { type: String },
    price: {
      monthly:  { type: Number, required: true, default: 0 },
      yearly:   { type: Number, required: true, default: 0 },
    },
    currency:    { type: String, default: 'USD' },
    limits: {
      maxUsers:      { type: Number, default: 5 },
      maxStorage:    { type: Number, default: 5 },    // GB
      apiAccess:     { type: Boolean, default: false },
      auditLogs:     { type: Boolean, default: false },
      customRoles:   { type: Boolean, default: false },
      prioritySupport: { type: Boolean, default: false },
    },
    features:    [{ type: String }],
    isActive:    { type: Boolean, default: true },
    isFree:      { type: Boolean, default: false },
    sortOrder:   { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Plan', PlanSchema);
