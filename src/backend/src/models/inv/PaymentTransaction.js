'use strict';

const mongoose = require('mongoose');

const PaymentTransactionSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  voucherNo: { type: String, required: true, index: true }, // e.g. REC-2026-0001, PAY-2026-0001, BILL-2026-0001, INV-2026-0001
  
  partyType: { type: String, enum: ['CUSTOMER', 'SUPPLIER'], required: true },
  partyId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'partyModel', index: true },
  partyModel: { type: String, enum: ['InvCustomer', 'InvSupplier'], required: true },

  txnType: {
    type: String,
    enum: [
      'BILL',        // Purchase from Supplier (creates Payable)
      'INVOICE',     // Sale to Customer (creates Receivable)
      'PAYMENT_OUT', // Payment made to Supplier (reduces Payable)
      'PAYMENT_IN',  // Payment collected from Customer (reduces Receivable)
      'OPENING_BAL', // Initial carry-forward balance
      'ADJUSTMENT',  // Discount, rebate, or credit/debit note adjustment
    ],
    required: true,
    index: true,
  },

  amount: { type: Number, required: true, min: 0 }, // Transaction value in INR
  
  paymentMode: {
    type: String,
    enum: ['UPI', 'NEFT_RTGS', 'CHEQUE', 'CASH', 'NET_BANKING', 'CARD', 'CREDIT'],
    default: 'UPI',
  },

  paymentDate: { type: Date, default: Date.now, index: true },
  dueDate: { type: Date, default: null }, // Credit due date calculated from party credit terms

  referenceNo: { type: String, trim: true }, // 12-digit UPI RRN / 16-digit Bank UTR / 6-digit Cheque No
  bankAccount: { type: String, trim: true }, // Bank Name / VPA ID / Cheque Details
  notes: { type: String, trim: true },

  stockLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvStockLedger', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

PaymentTransactionSchema.index({ tenantId: 1, partyId: 1, paymentDate: -1 });
PaymentTransactionSchema.index({ tenantId: 1, partyType: 1, txnType: 1 });

module.exports = mongoose.model('InvPaymentTransaction', PaymentTransactionSchema);
