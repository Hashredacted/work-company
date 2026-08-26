'use strict';

const mongoose = require('mongoose');

// All stock movements — positive qty = IN, negative qty = OUT
const StockLedgerSchema = new mongoose.Schema({
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'InvProduct', required: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'InvWarehouse', required: true },

  txnType: {
    type: String,
    enum: ['STOCK_IN', 'STOCK_OUT', 'QUICK_STOCK_IN', 'QUICK_STOCK_OUT', 'ADJUSTMENT', 'OPENING', 'GRN', 'SO_DISPATCH'],
    required: true,
  },
  refModel: { type: String, default: null }, // 'InvGRN', 'InvSalesOrder', 'InvAdjustment'
  refId:    { type: mongoose.Schema.Types.ObjectId, default: null },

  date:       { type: Date, default: Date.now },
  batchNo:    { type: String, default: null },
  expiryDate: { type: Date, default: null },
  // For SERIAL products, list of serials in/out
  serialNumbers: [{ type: String }],

  // +ve = stock IN, -ve = stock OUT
  qty:       { type: Number, required: true },
  unitCost:  { type: Number, default: 0 },   // INR per unit
  totalCost: { type: Number, default: 0 },   // qty * unitCost (absolute)

  remarks: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

StockLedgerSchema.index({ tenantId: 1, productId: 1, warehouseId: 1 });
StockLedgerSchema.index({ tenantId: 1, productId: 1, batchNo: 1 });
StockLedgerSchema.index({ tenantId: 1, date: -1 });

module.exports = mongoose.model('InvStockLedger', StockLedgerSchema);
