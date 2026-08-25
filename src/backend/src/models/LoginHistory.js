'use strict';

const mongoose = require('mongoose');

const LoginHistorySchema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    ip:       { type: String, default: null },
    userAgent:{ type: String, default: null },
    loginAt:  { type: Date, default: Date.now },
  },
  { timestamps: false }
);

LoginHistorySchema.index({ userId: 1, loginAt: -1 });

module.exports = mongoose.model('LoginHistory', LoginHistorySchema);
