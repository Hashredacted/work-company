'use strict';

const mongoose = require('mongoose');

// Permissions are stored as strings: "resource:action"
// e.g. "company:read", "user:create", "billing:manage"
const RoleSchema = new mongoose.Schema(
  {
    // null = system-level role (Super Admin, Company Admin defaults)
    tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
    name:         { type: String, required: true, trim: true },
    permissions:  { type: [String], default: [] }, // ["company:read", "user:create", ...]
    isSystemRole: { type: Boolean, default: false },
    deletedAt:    { type: Date, default: null },
  },
  { timestamps: true }
);

RoleSchema.index({ tenantId: 1, name: 1 });

module.exports = mongoose.model('Role', RoleSchema);
