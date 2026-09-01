'use strict';

const mongoose           = require('mongoose');
const Adjustment         = require('../../models/inv/Adjustment');
const StockLedger        = require('../../models/inv/StockLedger');
const Product            = require('../../models/inv/Product');
const Supplier           = require('../../models/inv/Supplier');
const Customer           = require('../../models/inv/Customer');
const BankAccount        = require('../../models/inv/BankAccount');
const PaymentTransaction = require('../../models/inv/PaymentTransaction');
const AuditLog           = require('../../models/AuditLog');
const { nextSeq }        = require('../../utils/sequence');
const { decrypt, mask }  = require('../../utils/encryption');

// GET /api/inventory/adjustments
async function list(req, res, next) {
  try {
    const adjs = await Adjustment.find({ tenantId: req.tenantId })
      .populate('warehouseId', 'name code')
      .populate('items.productId', 'name sku')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ data: adjs, message: 'OK', errors: null });
  } catch (e) {
    next(e);
  }
}

// POST /api/inventory/stock-adjust (Quick direct Stock In / Out + Payment & Outstanding Integration)
async function quickStock(req, res, next) {
  try {
    const {
      productId,
      warehouseId,
      type, // 'IN' | 'OUT'
      qty,
      unitCost,
      batchNo,
      expiryDate,
      remarks,
      // Optional Indian Commercial / Payment Fields
      supplierId,
      customerId,
      totalAmount,
      paymentStatus, // 'UNPAID' | 'PAID' | 'PARTIAL'
      paidAmount,
      paymentMode,
      bankAccountId,
      referenceNo,
    } = req.body;

    if (!productId || !warehouseId || !type || !qty) {
      return res.status(400).json({ data: null, message: 'productId, warehouseId, type (IN/OUT), and qty are required', errors: null });
    }

    const numericQty = Math.abs(Number(qty));
    if (numericQty <= 0) {
      return res.status(400).json({ data: null, message: 'Quantity must be greater than 0', errors: null });
    }

    const product = await Product.findOne({ _id: productId, tenantId: req.tenantId, deletedAt: null });
    if (!product) {
      return res.status(404).json({ data: null, message: 'Product not found', errors: null });
    }

    // Resolve Bank Account if Payment Mode is not CASH
    let resolvedBankAccountId = null;
    let resolvedBankAccountName = null;

    if (bankAccountId && mongoose.Types.ObjectId.isValid(bankAccountId)) {
      const bObj = await BankAccount.findOne({ _id: bankAccountId, tenantId: req.tenantId, deletedAt: null });
      if (bObj) {
        resolvedBankAccountId = bObj._id;
        const plainAcc = decrypt(bObj.accountNumber);
        resolvedBankAccountName = `${bObj.bankName} (****${plainAcc.slice(-4)})`;
      }
    } else if (paymentMode && paymentMode !== 'CASH') {
      let defBank = await BankAccount.findOne({ tenantId: req.tenantId, deletedAt: null, isActive: true, isDefault: true })
        || await BankAccount.findOne({ tenantId: req.tenantId, deletedAt: null, isActive: true });
      if (defBank) {
        resolvedBankAccountId = defBank._id;
        const plainAcc = decrypt(defBank.accountNumber);
        resolvedBankAccountName = `${defBank.bankName} (****${plainAcc.slice(-4)})`;
      }
    }

    const isCashMode = (paymentMode || 'UPI') === 'CASH';
    const acctDisplayName = isCashMode ? 'Cash in Hand (Drawer)' : (resolvedBankAccountName || 'Bank Account');

    const rand6 = Math.floor(100000 + Math.random() * 900000);
    const rand12 = Math.floor(100000000000 + Math.random() * 900000000000);
    let autoRef = `TXN-${rand6}`;
    if (paymentMode === 'UPI') autoRef = `UPI/${rand12}@okhdfc`;
    else if (paymentMode === 'NEFT_RTGS') autoRef = `HDFCN${rand6}`;
    else if (paymentMode === 'NET_BANKING') autoRef = `IMPS-${rand12}`;
    else if (paymentMode === 'CHEQUE') autoRef = `CHQ-${rand6}`;
    else if (paymentMode === 'CARD') autoRef = `POS-TXN-${rand6}`;
    else if (paymentMode === 'CASH') autoRef = `CASH-RCPT-${rand6}`;

    const finalRef = referenceNo ? referenceNo.trim() : autoRef;

    // If stock OUT, verify available stock
    if (type === 'OUT') {
      const stockAgg = await StockLedger.aggregate([
        { $match: { tenantId: req.tenantId, productId: new mongoose.Types.ObjectId(productId), warehouseId: new mongoose.Types.ObjectId(warehouseId) } },
        { $group: { _id: null, total: { $sum: '$qty' } } },
      ]);
      const currentAvailable = stockAgg[0]?.total || 0;
      if (currentAvailable < numericQty) {
        return res.status(400).json({
          data: null,
          message: `Insufficient stock in selected warehouse. Available: ${currentAvailable} ${product.unit}, requested to remove: ${numericQty} ${product.unit}`,
          errors: null,
        });
      }
    }

    const actualQty = type === 'IN' ? numericQty : -numericQty;
    const cost = unitCost !== undefined ? Number(unitCost) : (product.purchasePrice || 0);

    const ledgerEntry = await StockLedger.create({
      tenantId: req.tenantId,
      productId: product._id,
      warehouseId,
      txnType: type === 'IN' ? 'QUICK_STOCK_IN' : 'QUICK_STOCK_OUT',
      refModel: null,
      refId: null,
      date: new Date(),
      batchNo: batchNo || null,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      qty: actualQty,
      unitCost: cost,
      totalCost: Math.abs(actualQty * cost),
      remarks: remarks || (type === 'IN' ? 'Direct Stock In' : 'Direct Stock Out'),
      createdBy: req.user._id,
    });

    // Handle Payment / Outstanding Transaction if Supplier or Customer is attached
    let createdBillOrInvoice = null;
    let createdPayment = null;

    if (type === 'IN' && supplierId) {
      const supplier = await Supplier.findOne({ _id: supplierId, tenantId: req.tenantId, deletedAt: null });
      if (supplier) {
        const billVal = totalAmount ? Number(totalAmount) : Math.round(numericQty * cost);

        if (paymentStatus === 'PARTIAL' && paidAmount && Number(paidAmount) > billVal) {
          return res.status(400).json({
            data: null,
            message: `Paid amount (₹${Number(paidAmount).toLocaleString('en-IN')}) cannot exceed total bill amount (₹${billVal.toLocaleString('en-IN')}).`,
            errors: null,
          });
        }

        const billVoucherNo = await nextSeq(req.tenantId, 'BILL');
        const creditDays = supplier.paymentTerms || 30;
        const dueDate = new Date(Date.now() + creditDays * 86400000);

        createdBillOrInvoice = await PaymentTransaction.create({
          tenantId: req.tenantId,
          voucherNo: billVoucherNo,
          partyType: 'SUPPLIER',
          partyId: supplier._id,
          partyName: supplier.name,
          partyModel: 'InvSupplier',
          txnType: 'BILL',
          amount: billVal,
          paymentMode: 'CREDIT',
          paymentDate: new Date(),
          dueDate,
          referenceNo: finalRef,
          notes: remarks || `Stock In of ${numericQty} ${product.unit} (${product.name})`,
          stockLedgerId: ledgerEntry._id,
          createdBy: req.user._id,
        });

        if (paymentStatus === 'PAID' || paymentStatus === 'PARTIAL') {
          const settledAmt = paymentStatus === 'PAID' ? billVal : Number(paidAmount || 0);
          if (settledAmt > 0) {
            const payVoucherNo = await nextSeq(req.tenantId, 'PAY');
            createdPayment = await PaymentTransaction.create({
              tenantId: req.tenantId,
              voucherNo: payVoucherNo,
              partyType: 'SUPPLIER',
              partyId: supplier._id,
              partyName: supplier.name,
              partyModel: 'InvSupplier',
              txnType: 'PAYMENT_OUT',
              amount: settledAmt,
              paymentMode: paymentMode || 'UPI',
              paymentDate: new Date(),
              referenceNo: finalRef,
              bankAccount: resolvedBankAccountName,
              bankAccountId: resolvedBankAccountId,
              sourceName: acctDisplayName,
              destinationName: supplier.name,
              transferType: 'PARTY_PAYMENT',
              notes: `Payment for Bill ${billVoucherNo}`,
              allocatedBills: [{
                billId: createdBillOrInvoice._id,
                voucherNo: billVoucherNo,
                allocatedAmount: settledAmt,
                remainingBillBalance: Math.max(0, billVal - settledAmt),
              }],
              stockLedgerId: ledgerEntry._id,
              createdBy: req.user._id,
            });
            // Sync settledAmount and paymentStatus on the bill itself
            const newBillStatus = settledAmt >= billVal ? 'PAID' : 'PARTIALLY_PAID';
            await PaymentTransaction.updateOne(
              { _id: createdBillOrInvoice._id },
              { $set: { settledAmount: settledAmt, paymentStatus: newBillStatus } }
            );
            createdBillOrInvoice.settledAmount = settledAmt;
            createdBillOrInvoice.paymentStatus = newBillStatus;
          }
        }
      }
    } else if (type === 'OUT' && customerId) {
      const customer = await Customer.findOne({ _id: customerId, tenantId: req.tenantId, deletedAt: null });
      if (customer) {
        const gstMultiplier = 1 + (product.gstRate || 0) / 100;
        const defaultSellVal = Math.round(numericQty * (product.sellingPrice || product.mrp || cost) * gstMultiplier);
        const invVal = totalAmount ? Number(totalAmount) : defaultSellVal;

        if (paymentStatus === 'PARTIAL' && paidAmount && Number(paidAmount) > invVal) {
          return res.status(400).json({
            data: null,
            message: `Paid amount (₹${Number(paidAmount).toLocaleString('en-IN')}) cannot exceed total invoice amount (₹${invVal.toLocaleString('en-IN')}).`,
            errors: null,
          });
        }

        const invVoucherNo = await nextSeq(req.tenantId, 'INV');
        const creditDays = customer.paymentTerms || 15;
        const dueDate = new Date(Date.now() + creditDays * 86400000);

        createdBillOrInvoice = await PaymentTransaction.create({
          tenantId: req.tenantId,
          voucherNo: invVoucherNo,
          partyType: 'CUSTOMER',
          partyId: customer._id,
          partyName: customer.name,
          partyModel: 'InvCustomer',
          txnType: 'INVOICE',
          amount: invVal,
          paymentMode: 'CREDIT',
          paymentDate: new Date(),
          dueDate,
          referenceNo: finalRef,
          notes: remarks || `Stock Out of ${numericQty} ${product.unit} (${product.name})`,
          stockLedgerId: ledgerEntry._id,
          createdBy: req.user._id,
        });

        if (paymentStatus === 'PAID' || paymentStatus === 'PARTIAL') {
          const settledAmt = paymentStatus === 'PAID' ? invVal : Number(paidAmount || 0);
          if (settledAmt > 0) {
            const recVoucherNo = await nextSeq(req.tenantId, 'REC');
            createdPayment = await PaymentTransaction.create({
              tenantId: req.tenantId,
              voucherNo: recVoucherNo,
              partyType: 'CUSTOMER',
              partyId: customer._id,
              partyName: customer.name,
              partyModel: 'InvCustomer',
              txnType: 'PAYMENT_IN',
              amount: settledAmt,
              paymentMode: paymentMode || 'UPI',
              paymentDate: new Date(),
              referenceNo: finalRef,
              bankAccount: resolvedBankAccountName,
              bankAccountId: resolvedBankAccountId,
              sourceName: customer.name,
              destinationName: acctDisplayName,
              transferType: 'PARTY_RECEIPT',
              notes: `Payment for Invoice ${invVoucherNo}`,
              allocatedBills: [{
                billId: createdBillOrInvoice._id,
                voucherNo: invVoucherNo,
                allocatedAmount: settledAmt,
                remainingBillBalance: Math.max(0, invVal - settledAmt),
              }],
              stockLedgerId: ledgerEntry._id,
              createdBy: req.user._id,
            });
            // Sync settledAmount and paymentStatus on the invoice itself
            const newInvStatus = settledAmt >= invVal ? 'PAID' : 'PARTIALLY_PAID';
            await PaymentTransaction.updateOne(
              { _id: createdBillOrInvoice._id },
              { $set: { settledAmount: settledAmt, paymentStatus: newInvStatus } }
            );
            createdBillOrInvoice.settledAmount = settledAmt;
            createdBillOrInvoice.paymentStatus = newInvStatus;
          }
        }
      }
    }

    // Calculate new total stock
    const newStockAgg = await StockLedger.aggregate([
      { $match: { tenantId: req.tenantId, productId: product._id } },
      { $group: { _id: null, total: { $sum: '$qty' } } },
    ]);
    const newTotalStock = newStockAgg[0]?.total || 0;

    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: type === 'IN' ? 'STOCK_IN' : 'STOCK_OUT',
      resource: 'inventory',
      resourceId: product._id.toString(),
      details: {
        productName: product.name,
        sku: product.sku,
        qty: actualQty,
        newTotalStock,
        billOrInvoice: createdBillOrInvoice?.voucherNo,
        paymentVoucher: createdPayment?.voucherNo,
      },
      ip: req.ip,
    });

    res.status(201).json({
      data: {
        ledgerEntry,
        currentStock: newTotalStock,
        billOrInvoice: createdBillOrInvoice,
        paymentVoucher: createdPayment,
      },
      message: `Stock successfully ${type === 'IN' ? 'added (+)' : 'reduced (-)'}. New total: ${newTotalStock} ${product.unit}`,
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// POST /api/inventory/adjustments
async function create(req, res, next) {
  try {
    const { warehouseId, reason, items, adjustmentDate, notes } = req.body;
    if (!warehouseId || !reason || !items?.length)
      return res.status(400).json({ data: null, message: 'warehouseId, reason and items required', errors: null });

    const adjNumber = await nextSeq(req.tenantId, 'ADJ');
    const adjItems = [];

    // Compute system qty for each item from stock ledger
    for (const item of items) {
      const agg = await StockLedger.aggregate([
        { $match: { tenantId: req.tenantId, productId: new mongoose.Types.ObjectId(item.productId), warehouseId: new mongoose.Types.ObjectId(warehouseId), ...(item.batchNo ? { batchNo: item.batchNo } : {}) } },
        { $group: { _id: null, total: { $sum: '$qty' } } },
      ]);
      const systemQty = agg[0]?.total || 0;
      adjItems.push({
        productId: item.productId,
        batchNo: item.batchNo || null,
        physicalQty: item.physicalQty,
        systemQty,
        differenceQty: item.physicalQty - systemQty,
        unitCost: item.unitCost || 0,
      });
    }

    const adj = await Adjustment.create({
      tenantId: req.tenantId,
      adjNumber,
      warehouseId,
      adjustmentDate: adjustmentDate || new Date(),
      reason,
      items: adjItems,
      notes,
      createdBy: req.user._id,
      status: 'APPROVED',
    });

    // Directly apply differences to ledger
    const ledgerEntries = adjItems
      .filter(i => i.differenceQty !== 0)
      .map(i => ({
        tenantId: req.tenantId,
        productId: i.productId,
        warehouseId: adj.warehouseId,
        txnType: 'ADJUSTMENT',
        refModel: 'InvAdjustment',
        refId: adj._id,
        date: adj.adjustmentDate,
        batchNo: i.batchNo,
        qty: i.differenceQty,
        unitCost: i.unitCost,
        totalCost: Math.abs(i.differenceQty * i.unitCost),
        remarks: `Adjustment ${adj.adjNumber}: ${adj.reason}`,
        createdBy: req.user._id,
      }));

    if (ledgerEntries.length) await StockLedger.insertMany(ledgerEntries);

    res.status(201).json({ data: adj, message: `Stock Adjustment ${adjNumber} applied successfully`, errors: null });
  } catch (e) {
    next(e);
  }
}

// POST /api/inventory/invoices (Create rich multi-item Sales Invoice or Purchase Bill)
async function createInvoice(req, res, next) {
  try {
    const {
      invoiceType, // 'SALES' | 'PURCHASE'
      prefix, // e.g. 'INV', 'BILL', 'SME'
      invoiceNumber, // e.g. '128'
      partyType, // 'CUSTOMER' | 'SUPPLIER'
      partyId,
      partyName,
      warehouseId,
      invoiceDate,
      paymentTerms, // in days e.g. 30
      dueDate,
      items, // array of { productId, productName, sku, hsn, qty, unit, unitPrice, discountPct, taxPct, amount }
      subtotal,
      discountTotal,
      taxTotal,
      additionalCharges,
      totalAmount,
      // Payment Settlement
      paymentStatus, // 'PAID' | 'PARTIAL' | 'UNPAID'
      paidAmount,
      paymentMode, // 'CASH' | 'UPI' | 'NEFT_RTGS' | 'NET_BANKING' | 'CHEQUE' | 'CARD'
      bankAccountId,
      referenceNo,
      notes,
      termsAndConditions,
      // Transport & Compliance
      eWayBillNo,
      dispatchedThrough,
      vehicleNo,
      emailId,
      poNumber,
    } = req.body;

    if (!invoiceType || !items || !items.length) {
      return res.status(400).json({ data: null, message: 'invoiceType (SALES/PURCHASE) and items array are required', errors: null });
    }

    const isSales = invoiceType === 'SALES';
    const finalPartyType = isSales ? 'CUSTOMER' : 'SUPPLIER';

    // Find default warehouse if not provided
    let finalWarehouseId = warehouseId;
    if (!finalWarehouseId || !mongoose.Types.ObjectId.isValid(finalWarehouseId)) {
      const defWh = await require('../../models/inv/Warehouse').findOne({ tenantId: req.tenantId, deletedAt: null, isDefault: true })
        || await require('../../models/inv/Warehouse').findOne({ tenantId: req.tenantId, deletedAt: null });
      if (defWh) finalWarehouseId = defWh._id;
    }

    // Party resolution
    let resolvedPartyId = null;
    let resolvedPartyName = (partyName || '').trim();
    let resolvedPartyModel = null;

    if (partyId && mongoose.Types.ObjectId.isValid(partyId)) {
      if (isSales) {
        const cus = await Customer.findOne({ _id: partyId, tenantId: req.tenantId, deletedAt: null });
        if (cus) {
          resolvedPartyId = cus._id;
          resolvedPartyName = cus.name;
          resolvedPartyModel = 'InvCustomer';
        }
      } else {
        const sup = await Supplier.findOne({ _id: partyId, tenantId: req.tenantId, deletedAt: null });
        if (sup) {
          resolvedPartyId = sup._id;
          resolvedPartyName = sup.name;
          resolvedPartyModel = 'InvSupplier';
        }
      }
    }

    if (!resolvedPartyName) {
      resolvedPartyName = isSales ? 'Cash / Retail Customer' : 'Trade Supplier';
    }

    // Process items & validate stock if Sales
    const processedItems = [];
    const stockEntries = [];
    let calcSubtotal = 0;
    let calcTax = 0;
    let calcDiscount = 0;

    for (const item of items) {
      const q = Math.abs(Number(item.qty) || 1);
      const rate = Number(item.unitPrice) || 0;
      const discPct = Number(item.discountPct) || 0;
      const taxPct = Number(item.taxPct) || 0;

      const lineBase = q * rate;
      const lineDisc = (lineBase * discPct) / 100;
      const lineTaxable = lineBase - lineDisc;
      const lineTax = (lineTaxable * taxPct) / 100;
      const lineAmt = Math.round((lineTaxable + lineTax) * 100) / 100;

      calcSubtotal += lineBase;
      calcDiscount += lineDisc;
      calcTax += lineTax;

      let prodObj = null;
      if (item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
        prodObj = await Product.findOne({ _id: item.productId, tenantId: req.tenantId, deletedAt: null });
      }

      if (isSales && prodObj && finalWarehouseId) {
        // Check available stock
        const stockAgg = await StockLedger.aggregate([
          { $match: { tenantId: req.tenantId, productId: prodObj._id, warehouseId: new mongoose.Types.ObjectId(finalWarehouseId) } },
          { $group: { _id: null, total: { $sum: '$qty' } } },
        ]);
        const available = stockAgg[0]?.total || 0;
        if (available < q) {
          return res.status(400).json({
            data: null,
            message: `Insufficient stock for "${prodObj.name}". Available: ${available} ${prodObj.unit}, Requested: ${q} ${prodObj.unit}`,
            errors: null,
          });
        }
      }

      processedItems.push({
        productId: prodObj?._id || null,
        productName: item.productName || prodObj?.name || 'Item',
        sku: item.sku || prodObj?.sku || '',
        hsn: item.hsn || prodObj?.hsnCode || '',
        qty: q,
        unit: item.unit || prodObj?.unit || 'PCS',
        unitPrice: rate,
        discountPct: discPct,
        taxPct: taxPct,
        amount: lineAmt,
      });

      if (prodObj && finalWarehouseId) {
        stockEntries.push({
          tenantId: req.tenantId,
          productId: prodObj._id,
          warehouseId: finalWarehouseId,
          txnType: isSales ? 'QUICK_STOCK_OUT' : 'QUICK_STOCK_IN',
          refModel: 'InvPaymentTransaction',
          refId: null,
          date: invoiceDate ? new Date(invoiceDate) : new Date(),
          qty: isSales ? -q : q,
          unitCost: rate,
          totalCost: Math.abs(q * rate),
          remarks: `${isSales ? 'Sales Invoice' : 'Purchase Bill'} for ${resolvedPartyName}`,
          createdBy: req.user._id,
        });
      }
    }

    const finalSubtotal = subtotal !== undefined ? Number(subtotal) : calcSubtotal;
    const finalDiscTotal = discountTotal !== undefined ? Number(discountTotal) : calcDiscount;
    const finalTaxTotal = taxTotal !== undefined ? Number(taxTotal) : calcTax;
    const finalExtra = Number(additionalCharges) || 0;
    const finalTotalAmt = totalAmount !== undefined ? Number(totalAmount) : (finalSubtotal - finalDiscTotal + finalTaxTotal + finalExtra);

    // Sequence / Voucher No
    let finalVoucherNo = '';
    const seqType = isSales ? 'INV' : 'BILL';
    if (invoiceNumber && prefix) {
      finalVoucherNo = `${prefix}-${invoiceNumber}`;
    } else if (invoiceNumber) {
      finalVoucherNo = `${seqType}-${invoiceNumber}`;
    } else {
      finalVoucherNo = await nextSeq(req.tenantId, seqType);
    }

    const invDateObj = invoiceDate ? new Date(invoiceDate) : new Date();
    let calculatedDueDate = dueDate ? new Date(dueDate) : null;
    if (!calculatedDueDate && paymentTerms) {
      calculatedDueDate = new Date(invDateObj.getTime() + Number(paymentTerms) * 86400000);
    } else if (!calculatedDueDate) {
      calculatedDueDate = new Date(invDateObj.getTime() + (isSales ? 15 : 30) * 86400000);
    }

    // Resolve Bank Account
    let resolvedBankAccountId = null;
    let resolvedBankAccountName = null;
    if (bankAccountId && mongoose.Types.ObjectId.isValid(bankAccountId)) {
      const bObj = await BankAccount.findOne({ _id: bankAccountId, tenantId: req.tenantId, deletedAt: null });
      if (bObj) {
        resolvedBankAccountId = bObj._id;
        const plainAcc = decrypt(bObj.accountNumber);
        resolvedBankAccountName = `${bObj.bankName} (****${plainAcc.slice(-4)})`;
      }
    } else if (paymentMode && paymentMode !== 'CASH') {
      const defBank = await BankAccount.findOne({ tenantId: req.tenantId, deletedAt: null, isDefault: true })
        || await BankAccount.findOne({ tenantId: req.tenantId, deletedAt: null, isActive: true });
      if (defBank) {
        resolvedBankAccountId = defBank._id;
        const plainAcc = decrypt(defBank.accountNumber);
        resolvedBankAccountName = `${defBank.bankName} (****${plainAcc.slice(-4)})`;
      }
    }

    const isCashMode = (paymentMode || 'UPI') === 'CASH';
    const acctDisplayName = isCashMode ? 'Cash in Hand (Drawer)' : (resolvedBankAccountName || 'Bank Account');

    const rand6 = Math.floor(100000 + Math.random() * 900000);
    const rand12 = Math.floor(100000000000 + Math.random() * 900000000000);
    let autoRef = `TXN-${rand6}`;
    if (paymentMode === 'UPI') autoRef = `UPI/${rand12}@okhdfc`;
    else if (paymentMode === 'NEFT_RTGS') autoRef = `HDFCN${rand6}`;
    else if (paymentMode === 'NET_BANKING') autoRef = `IMPS-${rand12}`;
    else if (paymentMode === 'CHEQUE') autoRef = `CHQ-${rand6}`;
    else if (paymentMode === 'CARD') autoRef = `POS-TXN-${rand6}`;
    else if (paymentMode === 'CASH') autoRef = `CASH-${rand6}`;
    const finalRef = referenceNo ? referenceNo.trim() : autoRef;

    // Create Main Invoice / Bill Transaction
    const invoiceTxn = await PaymentTransaction.create({
      tenantId: req.tenantId,
      voucherNo: finalVoucherNo,
      partyType: finalPartyType,
      partyId: resolvedPartyId,
      partyName: resolvedPartyName,
      partyModel: resolvedPartyModel,
      txnType: isSales ? 'INVOICE' : 'BILL',
      amount: finalTotalAmt,
      paymentMode: 'CREDIT',
      paymentDate: invDateObj,
      dueDate: calculatedDueDate,
      referenceNo: finalRef,
      notes: notes || `${isSales ? 'Sales Invoice' : 'Purchase Bill'} ${finalVoucherNo}`,
      items: processedItems,
      subtotal: finalSubtotal,
      discountTotal: finalDiscTotal,
      taxTotal: finalTaxTotal,
      additionalCharges: finalExtra,
      prefix: prefix || '',
      invoiceNumber: invoiceNumber || '',
      eWayBillNo: eWayBillNo || '',
      dispatchedThrough: dispatchedThrough || '',
      vehicleNo: vehicleNo || '',
      emailId: emailId || '',
      poNumber: poNumber || '',
      termsAndConditions: termsAndConditions || '',
      createdBy: req.user._id,
    });

    // Create stock ledger entries
    if (stockEntries.length) {
      stockEntries.forEach(s => s.refId = invoiceTxn._id);
      await StockLedger.insertMany(stockEntries);
    }

    // Handle Payment Settlement
    let createdPayment = null;
    if (paymentStatus === 'PAID' || paymentStatus === 'PARTIAL') {
      const settledAmt = paymentStatus === 'PAID' ? finalTotalAmt : Math.min(finalTotalAmt, Number(paidAmount || 0));
      if (settledAmt > 0) {
        const paySeqType = isSales ? 'REC' : 'PAY';
        const payVoucherNo = await nextSeq(req.tenantId, paySeqType);
        createdPayment = await PaymentTransaction.create({
          tenantId: req.tenantId,
          voucherNo: payVoucherNo,
          partyType: finalPartyType,
          partyId: resolvedPartyId,
          partyName: resolvedPartyName,
          partyModel: resolvedPartyModel,
          txnType: isSales ? 'PAYMENT_IN' : 'PAYMENT_OUT',
          amount: settledAmt,
          paymentMode: paymentMode || 'UPI',
          paymentDate: invDateObj,
          referenceNo: finalRef,
          bankAccount: resolvedBankAccountName,
          bankAccountId: resolvedBankAccountId,
          sourceName: isSales ? resolvedPartyName : acctDisplayName,
          destinationName: isSales ? acctDisplayName : resolvedPartyName,
          transferType: isSales ? 'PARTY_RECEIPT' : 'PARTY_PAYMENT',
          notes: `Settlement for ${isSales ? 'Invoice' : 'Bill'} ${finalVoucherNo}`,
          allocatedBills: [{
            billId: invoiceTxn._id,
            voucherNo: finalVoucherNo,
            allocatedAmount: settledAmt,
            remainingBillBalance: Math.max(0, finalTotalAmt - settledAmt),
          }],
          createdBy: req.user._id,
        });

        const newStatus = settledAmt >= finalTotalAmt ? 'PAID' : 'PARTIALLY_PAID';
        await PaymentTransaction.updateOne(
          { _id: invoiceTxn._id },
          { $set: { settledAmount: settledAmt, paymentStatus: newStatus } }
        );
        invoiceTxn.settledAmount = settledAmt;
        invoiceTxn.paymentStatus = newStatus;
      }
    }

    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: isSales ? 'SALES_INVOICE_CREATE' : 'PURCHASE_BILL_CREATE',
      resource: 'inventory',
      resourceId: invoiceTxn._id.toString(),
      details: {
        voucherNo: finalVoucherNo,
        partyName: resolvedPartyName,
        totalAmount: finalTotalAmt,
        itemCount: processedItems.length,
        paymentStatus: invoiceTxn.paymentStatus,
      },
    });

    res.status(201).json({
      data: {
        invoice: invoiceTxn,
        payment: createdPayment,
      },
      message: `${isSales ? 'Sales Invoice' : 'Purchase Bill'} ${finalVoucherNo} created successfully!`,
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

module.exports = { list, quickStock, create, createInvoice };
