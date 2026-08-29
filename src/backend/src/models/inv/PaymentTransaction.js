'use strict';

const mongoose = require('mongoose');

const PaymentTransactionSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  voucherNo: { type: String, required: true, index: true }, // e.g. REC-2026-0001, PAY-2026-0001, BILL-2026-0001, INV-2026-0001
  
  partyType: { type: String, enum: ['CUSTOMER', 'SUPPLIER', 'OTHER', 'EXTERNAL'], default: 'CUSTOMER' },
  partyId: { type: mongoose.Schema.Types.ObjectId, refPath: 'partyModel', default: null, index: true },
  partyModel: { type: String, enum: ['InvCustomer', 'InvSupplier', null], default: null },
  partyName: { type: String, trim: true, default: '' }, // For outside parties / owners / landlords / lenders

  txnType: {
    type: String,
    enum: [
      'BILL',            // Purchase from Supplier (creates Payable)
      'INVOICE',         // Sale to Customer (creates Receivable)
      'PAYMENT_OUT',     // Payment made to Supplier (reduces Payable)
      'PAYMENT_IN',      // Payment collected from Customer (reduces Receivable)
      'OPENING_BAL',     // Initial carry-forward balance
      'ADJUSTMENT',      // Discount, rebate, or credit/debit note adjustment
      'OUTSIDE_INFLOW',  // External Capital Injection, Loan In, Non-trading Cash In (+)
      'OUTSIDE_OUTFLOW', // Owner Drawings, Rent/Utility, Non-trading Cash Out (-)
    ],
    required: true,
    index: true,
  },

  isOutsideCashflow: { type: Boolean, default: false, index: true },
  cashflowCategory: {
    type: String,
    enum: [
      'TRADING_COLLECTION',
      'TRADING_PAYMENT',
      'CAPITAL_INJECTION',
      'OWNER_DRAWINGS',
      'RENT_AND_UTILITIES',
      'SALARY_AND_WAGES',
      'OFFICE_EXPENSES',
      'LOAN_RECEIVED',
      'LOAN_REPAYMENT',
      'BANK_CHARGES_TAX',
      'CASH_DEPOSIT_BANK',
      'CASH_WITHDRAWAL_BANK',
      'OTHER_INFLOW',
      'OTHER_OUTFLOW',
    ],
    default: 'TRADING_COLLECTION',
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

  // Bill-wise Knockoff Tracking (for BILL & INVOICE records)
  settledAmount: { type: Number, default: 0, min: 0 },
  paymentStatus: { type: String, enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID'], default: 'UNPAID', index: true },

  // Linked Bill Allocations (for PAYMENT_IN & PAYMENT_OUT records)
  allocatedBills: [
    {
      billId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvPaymentTransaction' },
      voucherNo: { type: String },
      allocatedAmount: { type: Number, required: true },
      remainingBillBalance: { type: Number, default: 0 },
    },
  ],

  stockLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvStockLedger', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

PaymentTransactionSchema.index({ tenantId: 1, partyId: 1, paymentDate: -1 });
PaymentTransactionSchema.index({ tenantId: 1, partyType: 1, txnType: 1 });
PaymentTransactionSchema.index({ tenantId: 1, 'allocatedBills.billId': 1 });

module.exports = mongoose.model('InvPaymentTransaction', PaymentTransactionSchema);
