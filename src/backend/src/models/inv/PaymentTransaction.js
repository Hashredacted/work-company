'use strict';

const mongoose = require('mongoose');

const PaymentTransactionSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  voucherNo: { type: String, required: true, index: true }, // e.g. REC-2026-0001, PAY-2026-0001, BILL-2026-0001, INV-2026-0001
  
  partyType: { type: String, enum: ['CUSTOMER', 'SUPPLIER', 'OTHER', 'EXTERNAL', 'INTERNAL'], default: 'CUSTOMER' },
  partyId: { type: mongoose.Schema.Types.ObjectId, refPath: 'partyModel', default: null, index: true },
  partyModel: { type: String, enum: ['InvCustomer', 'InvSupplier', null], default: null },
  partyName: { type: String, trim: true, default: '' }, // For outside parties / owners / landlords / lenders

  txnType: {
    type: String,
    enum: [
      'BILL',            // Purchase from Supplier (creates Payable)
      'INVOICE',         // Sale to Customer (creates Receivable)
      'CREDIT_NOTE',     // Sales Return / Credit Adjustment to Customer (reduces Receivable)
      'DEBIT_NOTE',      // Purchase Return / Debit Adjustment to Supplier (reduces Payable)
      'DELIVERY_CHALLAN',// Movement of goods without tax sale (Rule 55, Job work / Branch transfer)
      'PAYMENT_OUT',     // Payment made to Supplier (reduces Payable)
      'PAYMENT_IN',      // Payment collected from Customer (reduces Receivable)
      'OPENING_BAL',     // Initial carry-forward balance
      'ADJUSTMENT',      // Discount, rebate, or credit/debit note adjustment
      'OUTSIDE_INFLOW',  // External Capital Injection, Loan In, Non-trading Cash In (+)
      'OUTSIDE_OUTFLOW', // Owner Drawings, Rent/Utility, Non-trading Cash Out (-)
      'CONTRA',          // Bank-to-Bank, Cash-to-Bank, Bank-to-Cash Fund Transfer
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
      'INTER_BANK_TRANSFER',
      'DIRECT_BANK_RECEIPT',
      'DIRECT_BANK_PAYMENT',
      'PETTY_CASH_EXPENSE',
      'OTHER_INFLOW',
      'OTHER_OUTFLOW',
    ],
    default: 'TRADING_COLLECTION',
    index: true,
  },

  amount: { type: Number, required: true, min: 0 }, // Transaction value in INR
  
  paymentMode: {
    type: String,
    enum: ['UPI', 'NEFT_RTGS', 'CHEQUE', 'CASH', 'NET_BANKING', 'CARD', 'CREDIT', 'TRANSFER', 'ONLINE', 'BANK_TRANSFER', 'ADVANCE'],
    default: 'UPI',
  },

  paymentDate: { type: Date, default: Date.now, index: true },
  dueDate: { type: Date, default: null }, // Credit due date calculated from party credit terms

  referenceNo: { type: String, trim: true }, // 12-digit UPI RRN / 16-digit Bank UTR / 6-digit Cheque No
  bankAccount: { type: String, trim: true }, // Legacy string Bank Name / VPA ID / Cheque Details
  bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvBankAccount', default: null, index: true }, // Linked Bank Account
  toBankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvBankAccount', default: null, index: true }, // Target Bank Account for Inter-Bank Transfers

  // Explicit attribution for Money Flow Tracking
  sourceName: { type: String, trim: true, default: '' },      // Who sent the money (Customer / Owner / Source Bank / Cash Register)
  destinationName: { type: String, trim: true, default: '' }, // Who received the money (Target Bank / Supplier / Expense / Cash Register)
  transferType: {
    type: String,
    enum: ['PARTY_PAYMENT', 'PARTY_RECEIPT', 'OUTSIDE_INFLOW', 'OUTSIDE_OUTFLOW', 'CASH_DEPOSIT', 'CASH_WITHDRAWAL', 'CASH_DEPOSIT_BANK', 'CASH_WITHDRAWAL_BANK', 'INTER_BANK_TRANSFER', 'ADJUSTMENT', null],
    default: null,
  },

  notes: { type: String, trim: true },

  // Bill-wise Knockoff Tracking (for BILL & INVOICE records)
  settledAmount: { type: Number, default: 0, min: 0 },
  paymentStatus: { type: String, enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID'], default: 'UNPAID', index: true },

  // Party Advance Tracking
  advanceAmount: { type: Number, default: 0, min: 0 }, // Surplus payment amount credited to party advance balance
  appliedAdvanceAmount: { type: Number, default: 0, min: 0 }, // Amount of party advance balance consumed to knock off bills

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

  // Rich Multi-Item Invoice & Billing Fields
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvProduct', default: null },
      productName: { type: String, trim: true },
      sku: { type: String, trim: true },
      hsn: { type: String, trim: true },
      qty: { type: Number, default: 1 }, // Billed quantity
      freeQty: { type: Number, default: 0 }, // Scheme / promotional free quantity
      unit: { type: String, default: 'PCS' },
      unitPrice: { type: Number, default: 0 },
      discountPct: { type: Number, default: 0 },
      taxPct: { type: Number, default: 0 },
      cgstRate: { type: Number, default: 0 },
      sgstRate: { type: Number, default: 0 },
      igstRate: { type: Number, default: 0 },
      cgstAmount: { type: Number, default: 0 },
      sgstAmount: { type: Number, default: 0 },
      igstAmount: { type: Number, default: 0 },
      taxableAmount: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
      isFree: { type: Boolean, default: false },
    },
  ],
  supplyType: { type: String, enum: ['INTRA', 'INTER'], default: 'INTRA' },
  subtotal: { type: Number, default: 0 },
  discountTotal: { type: Number, default: 0 },
  taxTotal: { type: Number, default: 0 },
  cgstTotal: { type: Number, default: 0 },
  sgstTotal: { type: Number, default: 0 },
  igstTotal: { type: Number, default: 0 },
  additionalCharges: { type: Number, default: 0 },
  charges: [
    {
      chargeType: {
        type: String,
        enum: ['TRANSPORT', 'COURIER', 'PACKAGING', 'LOADING', 'INSURANCE', 'INSTALLATION', 'OTHER'],
        default: 'OTHER',
      },
      name: { type: String, trim: true },
      amount: { type: Number, default: 0, min: 0 },
      taxPct: { type: Number, default: 0 },
      taxAmount: { type: Number, default: 0 },
    },
  ],
  gstDiscountMode: {
    type: String,
    enum: ['AFTER_DISCOUNT', 'BEFORE_DISCOUNT', 'INCLUSIVE'],
    default: 'AFTER_DISCOUNT',
  },
  cashDiscount: { type: Number, default: 0, min: 0 },
  roundOff: { type: Number, default: 0 }, // Statutory round-off (+/- 0.49 INR)
  prefix: { type: String, trim: true, default: '' },
  invoiceNumber: { type: String, trim: true, default: '' },

  // Credit Note & Debit Note Linking (Rule 53 / Section 34)
  originalInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvPaymentTransaction', default: null },
  originalVoucherNo: { type: String, trim: true, default: '' },
  originalInvoiceDate: { type: Date, default: null },
  reasonForReturn: {
    type: String,
    enum: ['SALES_RETURN', 'PURCHASE_RETURN', 'POST_SALE_DISCOUNT', 'DEFICIENT_GOODS', 'CORRECTION_IN_INVOICE', 'CHANGE_IN_POS', 'OTHER', ''],
    default: '',
  },

  // Logistics & Transportation (Rule 138 & Rule 55)
  eWayBillNo: { type: String, trim: true, default: '' },
  eWayBillDate: { type: Date, default: null },
  transporterId: { type: String, trim: true, uppercase: true, default: '' }, // 15-char Transporter GSTIN
  transporterName: { type: String, trim: true, default: '' },
  transportMode: { type: String, enum: ['ROAD', 'RAIL', 'AIR', 'SHIP'], default: 'ROAD' },
  vehicleNo: { type: String, trim: true, uppercase: true, default: '' },
  vehicleType: { type: String, enum: ['REGULAR', 'OVER_DIMENSIONAL_CARGO'], default: 'REGULAR' },
  lrNo: { type: String, trim: true, default: '' }, // Lorry Receipt / Bilty / Goods Receipt (GR) Number
  lrDate: { type: Date, default: null },
  distanceKm: { type: Number, default: 0 },
  dispatchedThrough: { type: String, trim: true, default: '' },

  // Ship-To (Consignee Details distinct from Bill-To Buyer)
  shipTo: {
    name: { type: String, trim: true, default: '' },
    gstin: { type: String, trim: true, uppercase: true, default: '' },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    stateCode: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
  },

  // Statutory GST Compliance Flags
  isRcm: { type: Boolean, default: false }, // Reverse Charge Mechanism (Sec 9(3)/9(4))
  isB2C: { type: Boolean, default: false },
  irn: { type: String, trim: true, default: '' }, // 64-char E-Invoicing Hash
  ackNo: { type: String, trim: true, default: '' },
  ackDate: { type: Date, default: null },

  // Split Tender / Multi-Mode Payment at Counter
  splitPayments: [
    {
      mode: { type: String, enum: ['CASH', 'UPI', 'CARD', 'CHEQUE', 'NET_BANKING', 'TRANSFER', 'ADVANCE'], default: 'CASH' },
      amount: { type: Number, required: true },
      referenceNo: { type: String, trim: true, default: '' },
      bankAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvBankAccount', default: null },
    },
  ],

  emailId: { type: String, trim: true, default: '' },
  poNumber: { type: String, trim: true, default: '' },
  termsAndConditions: { type: String, trim: true, default: '' },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

PaymentTransactionSchema.index({ tenantId: 1, voucherNo: 1 }, { unique: true });
PaymentTransactionSchema.index({ tenantId: 1, partyId: 1, paymentDate: -1 });
PaymentTransactionSchema.index({ tenantId: 1, partyType: 1, txnType: 1 });
PaymentTransactionSchema.index({ tenantId: 1, bankAccountId: 1, paymentDate: -1 });
PaymentTransactionSchema.index({ tenantId: 1, 'allocatedBills.billId': 1 });

module.exports = mongoose.model('InvPaymentTransaction', PaymentTransactionSchema);

