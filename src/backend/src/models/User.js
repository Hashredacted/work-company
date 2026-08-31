'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    // null = Super Admin (cross-tenant)
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },

    name:         { type: String, required: true, trim: true },
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone:        { type: String, trim: true, default: null },
    password:     { type: String, required: true, select: false },
    roleId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null },
    lastLoginAt:  { type: Date, default: null },
    isActive:     { type: Boolean, default: true },
    deletedAt:    { type: Date, default: null }, // soft-delete
  },
  { timestamps: true }
);

// Indexes for frequent queries
UserSchema.index({ tenantId: 1, email: 1 });
UserSchema.index({ phone: 1 });

// Hash password before saving
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compare plain password to stored hash
UserSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.password);
};

// Never expose password in responses
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);
