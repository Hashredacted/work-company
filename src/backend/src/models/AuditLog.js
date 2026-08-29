'use strict';

const mongoose = require('mongoose');
const { redactSensitiveData } = require('../utils/redactor');

const AuditLogSchema = new mongoose.Schema(
  {
    tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    action:     { type: String, required: true }, // e.g. "AUTH_LOGIN", "COMPANY_REGISTER", "STATUS_CHANGE"
    resource:   { type: String, required: true }, // e.g. "auth", "company", "user"
    resourceId: { type: String, default: null },
    details:    { type: mongoose.Schema.Types.Mixed, default: {} },
    ip:         { type: String, default: null },
    userAgent:  { type: String, default: null },
  },
  { timestamps: true }
);

// Zero-leak pre-save sanitization: Ensure no secrets, tokens, or raw credentials ever enter audit storage
AuditLogSchema.pre('save', function (next) {
  if (this.details) {
    this.details = redactSensitiveData(this.details);
  }
  if (typeof next === 'function') next();
});

AuditLogSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
