'use strict';

const mongoose = require('mongoose');

// Simple auto-increment counter per tenant per document type
const SequenceSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  key:      { type: String, required: true }, // e.g. "PO-2526"
  value:    { type: Number, default: 0 },
}, { timestamps: false });

SequenceSchema.index({ tenantId: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('Sequence', SequenceSchema);
