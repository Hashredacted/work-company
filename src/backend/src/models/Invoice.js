'use strict';

const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema(
  {
    tenantId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
    invoiceNumber:  { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['DRAFT', 'UNPAID', 'PAID', 'VOID', 'UNCOLLECTIBLE'],
      default: 'UNPAID',
    },
    currency:    { type: String, default: 'USD' },
    subtotal:    { type: Number, required: true, default: 0 },
    tax:         { type: Number, default: 0 },
    total:       { type: Number, required: true, default: 0 },
    dueDate:     { type: Date },
    paidAt:      { type: Date },
    voidedAt:    { type: Date },
    billingPeriodStart: { type: Date },
    billingPeriodEnd:   { type: Date },
    lineItems: [
      {
        description: { type: String },
        quantity:    { type: Number, default: 1 },
        unitPrice:   { type: Number, default: 0 },
        amount:      { type: Number, default: 0 },
      },
    ],
    notes: { type: String },
  },
  { timestamps: true }
);

InvoiceSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Invoice', InvoiceSchema);
