'use strict';

const mongoose           = require('mongoose');
const Adjustment         = require('../../models/inv/Adjustment');
const StockLedger        = require('../../models/inv/StockLedger');
const Product            = require('../../models/inv/Product');
const Supplier           = require('../../models/inv/Supplier');
const Customer           = require('../../models/inv/Customer');
const BankAccount        = require('../../models/inv/BankAccount');
const PaymentTransaction = require('../../models/inv/PaymentTransaction');
const Sequence           = require('../../models/Sequence');
const AuditLog           = require('../../models/AuditLog');
const { nextSeq, fyCode } = require('../../utils/sequence');
const { decrypt, mask }  = require('../../utils/encryption');
const { generateAutoReference } = require('../../utils/reference');

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

    const finalRef = referenceNo ? referenceNo.trim() : generateAutoReference(paymentMode || 'UPI');

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

// POST /api/inventory/invoices (Create Sales Invoice, Purchase Bill, Credit Note, Debit Note, or Delivery Challan)
async function createInvoice(req, res, next) {
  try {
    const {
      invoiceType, // 'SALES' | 'PURCHASE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'DELIVERY_CHALLAN' | 'QUOTATION'
      prefix, // e.g. 'INV', 'BILL', 'CRN', 'DBN', 'DC', 'EST'
      invoiceNumber,
      partyType, // 'CUSTOMER' | 'SUPPLIER'
      partyId,
      partyName,
      warehouseId,
      targetWarehouseId,
      invoiceDate,
      paymentTerms, // in days e.g. 30
      dueDate,
      supplyType, // 'INTRA' | 'INTER'
      items, // array of { productId, productName, sku, hsn, qty, freeQty, unit, unitPrice, discountPct, taxPct, amount }
      subtotal,
      discountTotal,
      taxTotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      additionalCharges,
      roundOff,
      totalAmount,
      // Payment Settlement
      paymentStatus, // 'PAID' | 'PARTIAL' | 'UNPAID'
      paidAmount,
      paymentMode, // 'CASH' | 'UPI' | 'NEFT_RTGS' | 'NET_BANKING' | 'CHEQUE' | 'CARD'
      splitPayments, // [{ mode, amount, referenceNo, bankAccountId }]
      bankAccountId,
      referenceNo,
      notes,
      termsAndConditions,
      // Credit & Debit Note Linkage (Rule 53)
      originalInvoiceId,
      originalVoucherNo,
      originalInvoiceDate,
      reasonForReturn,
      // Logistics & E-Way Bill (Rule 138 & Rule 55)
      eWayBillNo,
      eWayBillDate,
      transporterId,
      transporterName,
      transportMode,
      vehicleNo,
      vehicleType,
      lrNo,
      lrDate,
      distanceKm,
      dispatchedThrough,
      shipTo,
      // Statutory GST Compliance Flags
      isRcm,
      isB2C,
      irn,
      ackNo,
      ackDate,
      emailId,
      poNumber,
    } = req.body;

    if (!invoiceType || !items || !items.length) {
      return res.status(400).json({ data: null, message: 'invoiceType and items array are required', errors: null });
    }

    const docType = String(invoiceType).toUpperCase();
    const isSales = docType === 'SALES' || docType === 'INVOICE';
    const isPurchase = docType === 'PURCHASE' || docType === 'BILL';
    const isCreditNote = docType === 'CREDIT_NOTE';
    const isDebitNote = docType === 'DEBIT_NOTE';
    const isDeliveryChallan = docType === 'DELIVERY_CHALLAN';
    const isQuotation = docType === 'QUOTATION' || docType === 'ESTIMATE';

    let finalPartyType = 'CUSTOMER';
    if (isPurchase || isDebitNote) {
      finalPartyType = 'SUPPLIER';
    } else if (partyType === 'SUPPLIER') {
      finalPartyType = 'SUPPLIER';
    }

    const finalSupplyType = (supplyType || 'INTRA').toUpperCase() === 'INTER' ? 'INTER' : 'INTRA';
    const isInter = finalSupplyType === 'INTER';

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
    let calcCgst = 0;
    let calcSgst = 0;
    let calcIgst = 0;

    for (const item of items) {
      const billedQty = Math.max(0, Number(item.qty) || 0);
      const freeQty = Math.max(0, Number(item.freeQty) || 0);
      const totalUnits = billedQty + freeQty;
      const rate = Number(item.unitPrice) || 0;
      const discPct = Number(item.discountPct) || 0;
      const taxPct = Number(item.taxPct) || 0;

      // Base price is charged on billedQty only (freeQty is 0 cost to buyer)
      const lineBase = billedQty * rate;
      const lineDisc = (lineBase * discPct) / 100;
      const lineTaxable = lineBase - lineDisc;
      const lineTax = (lineTaxable * taxPct) / 100;
      const lineAmt = Math.round((lineTaxable + lineTax) * 100) / 100;

      const cgstR = isInter ? 0 : taxPct / 2;
      const sgstR = isInter ? 0 : taxPct / 2;
      const igstR = isInter ? taxPct : 0;

      const cgstA = isInter ? 0 : Math.round((lineTax / 2) * 100) / 100;
      const sgstA = isInter ? 0 : Math.round((lineTax / 2) * 100) / 100;
      const igstA = isInter ? Math.round(lineTax * 100) / 100 : 0;

      calcSubtotal += lineBase;
      calcDiscount += lineDisc;
      calcTax += lineTax;
      calcCgst += cgstA;
      calcSgst += sgstA;
      calcIgst += igstA;

      let prodObj = null;
      if (item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
        prodObj = await Product.findOne({ _id: item.productId, tenantId: req.tenantId, deletedAt: null });
      }

      if (isSales && prodObj && finalWarehouseId) {
        // Check available stock against total units moving out (billed + free)
        const stockAgg = await StockLedger.aggregate([
          { $match: { tenantId: req.tenantId, productId: prodObj._id, warehouseId: new mongoose.Types.ObjectId(finalWarehouseId) } },
          { $group: { _id: null, total: { $sum: '$qty' } } },
        ]);
        const available = stockAgg[0]?.total || 0;
        if (available < totalUnits) {
          return res.status(400).json({
            data: null,
            message: `Insufficient stock for "${prodObj.name}". Available: ${available} ${prodObj.unit}, Requested: ${totalUnits} ${prodObj.unit} (${billedQty} Billed + ${freeQty} Free)`,
            errors: null,
          });
        }
      }

      processedItems.push({
        productId: prodObj?._id || null,
        productName: item.productName || prodObj?.name || 'Item',
        sku: item.sku || prodObj?.sku || '',
        hsn: item.hsn || prodObj?.hsnCode || '',
        qty: billedQty,
        freeQty: freeQty,
        unit: item.unit || prodObj?.unit || 'PCS',
        unitPrice: rate,
        discountPct: discPct,
        taxPct: taxPct,
        cgstRate: cgstR,
        sgstRate: sgstR,
        igstRate: igstR,
        cgstAmount: cgstA,
        sgstAmount: sgstA,
        igstAmount: igstA,
        taxableAmount: lineTaxable,
        amount: lineAmt,
        isFree: (billedQty === 0 && freeQty > 0) || rate === 0,
      });

      // Prepare Stock Ledger movements (if not Quotation)
      if (prodObj && finalWarehouseId && totalUnits > 0 && !isQuotation) {
        let movementType = 'QUICK_STOCK_OUT';
        let movementQty = -totalUnits;

        if (isSales) {
          movementType = 'QUICK_STOCK_OUT';
          movementQty = -totalUnits;
        } else if (isPurchase) {
          movementType = 'QUICK_STOCK_IN';
          movementQty = totalUnits;
        } else if (isCreditNote) {
          // Sales return brings stock back IN to warehouse
          movementType = 'SALES_RETURN';
          movementQty = totalUnits;
        } else if (isDebitNote) {
          // Purchase return sends stock back OUT to vendor
          movementType = 'PURCHASE_RETURN';
          movementQty = -totalUnits;
        } else if (isDeliveryChallan) {
          movementType = 'DELIVERY_CHALLAN_OUT';
          movementQty = -totalUnits;
        }

        stockEntries.push({
          tenantId: req.tenantId,
          productId: prodObj._id,
          warehouseId: finalWarehouseId,
          txnType: movementType,
          refModel: 'InvPaymentTransaction',
          refId: null,
          date: invoiceDate ? new Date(invoiceDate) : new Date(),
          qty: movementQty,
          unitCost: rate,
          totalCost: Math.abs(billedQty * rate),
          remarks: `${docType} for ${resolvedPartyName}${freeQty > 0 ? ` (${freeQty} Free)` : ''}`,
          createdBy: req.user._id,
        });

        // Inter-godown transfer under Delivery Challan
        if (isDeliveryChallan && targetWarehouseId && mongoose.Types.ObjectId.isValid(targetWarehouseId)) {
          stockEntries.push({
            tenantId: req.tenantId,
            productId: prodObj._id,
            warehouseId: new mongoose.Types.ObjectId(targetWarehouseId),
            txnType: 'DELIVERY_CHALLAN_IN',
            refModel: 'InvPaymentTransaction',
            refId: null,
            date: invoiceDate ? new Date(invoiceDate) : new Date(),
            qty: totalUnits,
            unitCost: rate,
            totalCost: Math.abs(billedQty * rate),
            remarks: `Challan Inward from Godown ${finalWarehouseId}`,
            createdBy: req.user._id,
          });
        }
      }
    }

    const finalSubtotal = subtotal !== undefined ? Number(subtotal) : calcSubtotal;
    const finalDiscTotal = discountTotal !== undefined ? Number(discountTotal) : calcDiscount;
    const finalTaxTotal = taxTotal !== undefined ? Number(taxTotal) : calcTax;
    const finalCgstTotal = cgstTotal !== undefined ? Number(cgstTotal) : calcCgst;
    const finalSgstTotal = sgstTotal !== undefined ? Number(sgstTotal) : calcSgst;
    const finalIgstTotal = igstTotal !== undefined ? Number(igstTotal) : calcIgst;
    const finalExtra = Number(additionalCharges) || 0;

    // Automatic Indian Statutory Round-Off Calculation (Nearest Integer Rupee)
    const rawTotal = finalSubtotal - finalDiscTotal + finalTaxTotal + finalExtra;
    const roundedTotal = Math.round(rawTotal);
    const calculatedRoundOff = Math.round((roundedTotal - rawTotal) * 100) / 100;
    const finalRoundOff = roundOff !== undefined ? Number(roundOff) : calculatedRoundOff;
    const finalTotalAmt = totalAmount !== undefined ? Number(totalAmount) : (rawTotal + finalRoundOff);

    // Sequence / Voucher No determination
    let seqType = 'INV';
    if (isPurchase) seqType = 'BILL';
    else if (isCreditNote) seqType = 'CRN';
    else if (isDebitNote) seqType = 'DBN';
    else if (isDeliveryChallan) seqType = 'DC';
    else if (isQuotation) seqType = 'EST';

    let finalVoucherNo = '';
    if (invoiceNumber && prefix) {
      finalVoucherNo = `${prefix}-${invoiceNumber}`;
    } else if (invoiceNumber) {
      finalVoucherNo = `${seqType}-${invoiceNumber}`;
    } else {
      finalVoucherNo = await nextSeq(req.tenantId, seqType);
    }

    // Keep sequence counter in sync if a manual or auto-generated invoiceNumber was used
    const numMatch = String(invoiceNumber || finalVoucherNo).match(/(\d+)$/);
    if (numMatch) {
      const val = parseInt(numMatch[1], 10);
      if (val > 0) {
        const fy = fyCode();
        await Sequence.findOneAndUpdate(
          { tenantId: req.tenantId, key: `${seqType}-${fy}` },
          { $max: { value: val } },
          { upsert: true }
        );
      }
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
    const finalRef = referenceNo ? referenceNo.trim() : generateAutoReference(paymentMode || 'UPI');

    // Transaction Type Mapping
    let mappedTxnType = 'INVOICE';
    if (isPurchase) mappedTxnType = 'BILL';
    else if (isCreditNote) mappedTxnType = 'CREDIT_NOTE';
    else if (isDebitNote) mappedTxnType = 'DEBIT_NOTE';
    else if (isDeliveryChallan) mappedTxnType = 'DELIVERY_CHALLAN';
    else if (isQuotation) mappedTxnType = 'ADJUSTMENT';

    // Create Main Document / Voucher Transaction
    const invoiceTxn = await PaymentTransaction.create({
      tenantId: req.tenantId,
      voucherNo: finalVoucherNo,
      partyType: finalPartyType,
      partyId: resolvedPartyId,
      partyName: resolvedPartyName,
      partyModel: resolvedPartyModel,
      txnType: mappedTxnType,
      amount: finalTotalAmt,
      paymentMode: isDeliveryChallan || isQuotation ? 'CASH' : 'CREDIT',
      paymentDate: invDateObj,
      dueDate: calculatedDueDate,
      referenceNo: finalRef,
      notes: (typeof notes === 'string') ? notes.trim() : '',
      items: processedItems,
      supplyType: finalSupplyType,
      subtotal: finalSubtotal,
      discountTotal: finalDiscTotal,
      taxTotal: finalTaxTotal,
      cgstTotal: finalCgstTotal,
      sgstTotal: finalSgstTotal,
      igstTotal: finalIgstTotal,
      additionalCharges: finalExtra,
      roundOff: finalRoundOff,
      prefix: prefix || '',
      invoiceNumber: invoiceNumber || '',
      // Credit & Debit Note Linkage (Rule 53)
      originalInvoiceId: originalInvoiceId && mongoose.Types.ObjectId.isValid(originalInvoiceId) ? originalInvoiceId : null,
      originalVoucherNo: originalVoucherNo || '',
      originalInvoiceDate: originalInvoiceDate ? new Date(originalInvoiceDate) : null,
      reasonForReturn: reasonForReturn || '',
      // Logistics & E-Way Bill (Rule 138 & Rule 55)
      eWayBillNo: eWayBillNo || '',
      eWayBillDate: eWayBillDate ? new Date(eWayBillDate) : null,
      transporterId: transporterId || '',
      transporterName: transporterName || '',
      transportMode: transportMode || 'ROAD',
      vehicleNo: vehicleNo || '',
      vehicleType: vehicleType || 'REGULAR',
      lrNo: lrNo || '',
      lrDate: lrDate ? new Date(lrDate) : null,
      distanceKm: Number(distanceKm) || 0,
      dispatchedThrough: dispatchedThrough || '',
      shipTo: shipTo || undefined,
      // Statutory GST Compliance
      isRcm: Boolean(isRcm),
      isB2C: Boolean(isB2C),
      irn: irn || '',
      ackNo: ackNo || '',
      ackDate: ackDate ? new Date(ackDate) : null,
      splitPayments: Array.isArray(splitPayments) ? splitPayments : [],
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

    // Auto-settlement of Original Invoice when Credit Note or Debit Note is issued
    if ((isCreditNote || isDebitNote) && originalInvoiceId && mongoose.Types.ObjectId.isValid(originalInvoiceId)) {
      const origDoc = await PaymentTransaction.findOne({ _id: originalInvoiceId, tenantId: req.tenantId });
      if (origDoc) {
        const curSettled = origDoc.settledAmount || 0;
        const newSettled = Math.min(origDoc.amount, curSettled + finalTotalAmt);
        const newStatus = newSettled >= origDoc.amount ? 'PAID' : 'PARTIALLY_PAID';
        await PaymentTransaction.updateOne(
          { _id: origDoc._id },
          { $set: { settledAmount: newSettled, paymentStatus: newStatus } }
        );
      }
    }

    // Handle Payment Settlement (Single mode or Split Tender)
    let createdPayment = null;
    if ((paymentStatus === 'PAID' || paymentStatus === 'PARTIAL') && !isDeliveryChallan && !isQuotation) {
      const PartyModel = isSales ? Customer : Supplier;
      // If multi-mode Split Tender is provided
      if (Array.isArray(splitPayments) && splitPayments.length > 0) {
        let totalSplitPaid = 0;
        let cumulativeSettledOnBill = 0;
        let totalAdvanceAppliedOnBill = 0;
        const totalRawSplit = splitPayments.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const splitOverpayment = Math.max(0, totalRawSplit - finalTotalAmt);

        for (const sp of splitPayments) {
          const spAmt = Number(sp.amount) || 0;
          if (spAmt <= 0) continue;
          totalSplitPaid += spAmt;

          const isSpAdvance = (sp.mode || '').toUpperCase() === 'ADVANCE';
          if (isSpAdvance && resolvedPartyId) {
            await PartyModel.updateOne({ _id: resolvedPartyId, tenantId: req.tenantId }, { $inc: { advanceBalance: -spAmt } });
          }

          // Portioned allocation to this bill
          const neededOnBill = Math.max(0, finalTotalAmt - cumulativeSettledOnBill);
          const allocToBill = Math.min(spAmt, neededOnBill);
          cumulativeSettledOnBill += allocToBill;
          if (isSpAdvance) {
            totalAdvanceAppliedOnBill += allocToBill;
          }
          const spExcess = spAmt - allocToBill;

          const paySeq = isSales ? 'REC' : 'PAY';
          const splitVoucherNo = await nextSeq(req.tenantId, paySeq);
          await PaymentTransaction.create({
            tenantId: req.tenantId,
            voucherNo: splitVoucherNo,
            partyType: finalPartyType,
            partyId: resolvedPartyId,
            partyName: resolvedPartyName,
            partyModel: resolvedPartyModel,
            txnType: isSales ? 'PAYMENT_IN' : 'PAYMENT_OUT',
            amount: spAmt,
            advanceAmount: spExcess,
            appliedAdvanceAmount: isSpAdvance ? spAmt : 0,
            paymentMode: isSpAdvance ? 'ADVANCE' : (sp.mode || 'CASH'),
            paymentDate: invDateObj,
            referenceNo: sp.referenceNo || (isSpAdvance ? `ADV-${splitVoucherNo}` : finalRef),
            bankAccountId: isSpAdvance ? null : (sp.bankAccountId || resolvedBankAccountId),
            bankAccount: isSpAdvance ? 'Party Advance Account' : undefined,
            sourceName: isSales ? (isSpAdvance ? `${resolvedPartyName} (Advance Credit)` : resolvedPartyName) : (isSpAdvance ? 'Company Advance Account' : (sp.mode === 'CASH' ? 'Cash Drawer' : 'Bank')),
            destinationName: isSales ? (isSpAdvance ? 'Company Accounts' : (sp.mode === 'CASH' ? 'Cash Drawer' : 'Bank')) : (isSpAdvance ? `${resolvedPartyName} (Advance Credit)` : resolvedPartyName),
            transferType: isSales ? 'PARTY_RECEIPT' : 'PARTY_PAYMENT',
            notes: isSpAdvance
              ? `Split Payment (Advance Credit) for ${finalVoucherNo}`
              : `Split Payment (${sp.mode}) for ${finalVoucherNo}${spExcess > 0 ? ` [₹${spExcess.toLocaleString('en-IN')} to Advance]` : ''}`,
            allocatedBills: allocToBill > 0 ? [{
              billId: invoiceTxn._id,
              voucherNo: finalVoucherNo,
              allocatedAmount: allocToBill,
              remainingBillBalance: Math.max(0, finalTotalAmt - cumulativeSettledOnBill),
            }] : [],
            createdBy: req.user._id,
          });
        }

        if (splitOverpayment > 0 && resolvedPartyId) {
          await PartyModel.updateOne({ _id: resolvedPartyId, tenantId: req.tenantId }, { $inc: { advanceBalance: splitOverpayment } });
        }
        let autoBillNote = (typeof notes === 'string' && notes.trim()) ? notes.trim() : '';
        if (!autoBillNote) {
          if (totalAdvanceAppliedOnBill > 0 && splitOverpayment > 0) {
            autoBillNote = `Advance Credit Applied: ₹${totalAdvanceAppliedOnBill.toLocaleString('en-IN')} | Extra to Advance: ₹${splitOverpayment.toLocaleString('en-IN')}`;
          } else if (totalAdvanceAppliedOnBill > 0) {
            autoBillNote = `Advance Payment Applied: ₹${totalAdvanceAppliedOnBill.toLocaleString('en-IN')}`;
          } else if (splitOverpayment > 0) {
            autoBillNote = `Extra Payment to Advance: ₹${splitOverpayment.toLocaleString('en-IN')}`;
          }
        }

        const effectiveSettled = Math.min(finalTotalAmt, totalSplitPaid);
        const splitStatus = effectiveSettled >= finalTotalAmt ? 'PAID' : (effectiveSettled > 0 ? 'PARTIALLY_PAID' : 'UNPAID');
        await PaymentTransaction.updateOne(
          { _id: invoiceTxn._id },
          { $set: { settledAmount: effectiveSettled, paymentStatus: splitStatus, appliedAdvanceAmount: totalAdvanceAppliedOnBill, notes: autoBillNote } }
        );
        invoiceTxn.settledAmount = effectiveSettled;
        invoiceTxn.paymentStatus = splitStatus;
        invoiceTxn.appliedAdvanceAmount = totalAdvanceAppliedOnBill;
        invoiceTxn.notes = autoBillNote;
      } else {
        // Standard single payment settlement
        const rawPaid = Number(paidAmount || 0);
        const isSingleAdvance = (paymentMode || '').toUpperCase() === 'ADVANCE';
        const totalTendered = (paymentStatus === 'PAID' && rawPaid <= 0) ? finalTotalAmt : (paymentStatus === 'PAID' && rawPaid > 0 ? Math.max(finalTotalAmt, rawPaid) : rawPaid);

        if (totalTendered > 0) {
          const settledAmt = Math.min(finalTotalAmt, totalTendered);
          const singleOverpayment = isSingleAdvance ? 0 : Math.max(0, totalTendered - finalTotalAmt);
          const appliedAdvance = isSingleAdvance ? settledAmt : 0;

          if (isSingleAdvance && resolvedPartyId && appliedAdvance > 0) {
            await PartyModel.updateOne({ _id: resolvedPartyId, tenantId: req.tenantId }, { $inc: { advanceBalance: -appliedAdvance } });
          } else if (singleOverpayment > 0 && resolvedPartyId) {
            await PartyModel.updateOne({ _id: resolvedPartyId, tenantId: req.tenantId }, { $inc: { advanceBalance: singleOverpayment } });
          }

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
            amount: totalTendered,
            advanceAmount: singleOverpayment,
            appliedAdvanceAmount: appliedAdvance,
            paymentMode: isSingleAdvance ? 'ADVANCE' : (paymentMode || 'UPI'),
            paymentDate: invDateObj,
            referenceNo: isSingleAdvance ? `ADV-${payVoucherNo}` : finalRef,
            bankAccount: isSingleAdvance ? 'Party Advance Account' : resolvedBankAccountName,
            bankAccountId: isSingleAdvance ? null : resolvedBankAccountId,
            sourceName: isSales ? (isSingleAdvance ? `${resolvedPartyName} (Advance Credit)` : resolvedPartyName) : (isSingleAdvance ? 'Company Advance Account' : acctDisplayName),
            destinationName: isSales ? (isSingleAdvance ? 'Company Accounts' : acctDisplayName) : (isSingleAdvance ? `${resolvedPartyName} (Advance Credit)` : resolvedPartyName),
            transferType: isSales ? 'PARTY_RECEIPT' : 'PARTY_PAYMENT',
            notes: isSingleAdvance
              ? `Knockoff via Advance Credit for ${finalVoucherNo}`
              : `Settlement for ${seqType} ${finalVoucherNo}${singleOverpayment > 0 ? ` [Advance Credited: ₹${singleOverpayment.toLocaleString('en-IN')}]` : ''}`,
            allocatedBills: [{
              billId: invoiceTxn._id,
              voucherNo: finalVoucherNo,
              allocatedAmount: settledAmt,
              remainingBillBalance: Math.max(0, finalTotalAmt - settledAmt),
            }],
            createdBy: req.user._id,
          });

          let autoBillNote = (typeof notes === 'string' && notes.trim()) ? notes.trim() : '';
          if (!autoBillNote) {
            if (isSingleAdvance && appliedAdvance > 0) {
              autoBillNote = `Advance Payment: ₹${appliedAdvance.toLocaleString('en-IN')} (Settled via Advance Credit)`;
            } else if (singleOverpayment > 0) {
              autoBillNote = `Advance Credited: ₹${singleOverpayment.toLocaleString('en-IN')}`;
            } else if (paymentStatus === 'PARTIAL' && totalTendered > 0) {
              autoBillNote = `Advance Payment Received: ₹${totalTendered.toLocaleString('en-IN')} (Balance Due: ₹${Math.max(0, finalTotalAmt - totalTendered).toLocaleString('en-IN')})`;
            }
          }

          const newStatus = settledAmt >= finalTotalAmt ? 'PAID' : 'PARTIALLY_PAID';
          await PaymentTransaction.updateOne(
            { _id: invoiceTxn._id },
            { $set: { settledAmount: settledAmt, paymentStatus: newStatus, appliedAdvanceAmount: appliedAdvance, notes: autoBillNote } }
          );
          invoiceTxn.settledAmount = settledAmt;
          invoiceTxn.paymentStatus = newStatus;
          invoiceTxn.appliedAdvanceAmount = appliedAdvance;
          invoiceTxn.notes = autoBillNote;
        }
      }
    }

    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: `${docType}_CREATE`,
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
      message: `${seqType} ${finalVoucherNo} created successfully!`,
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// GET /api/inventory/invoices/next-number?type=SALES
async function getNextInvoiceNumber(req, res, next) {
  try {
    const docType = String(req.query.type || 'SALES').toUpperCase();
    const isPurchase = docType === 'PURCHASE' || docType === 'BILL';
    const isCreditNote = docType === 'CREDIT_NOTE';
    const isDebitNote = docType === 'DEBIT_NOTE';
    const isDeliveryChallan = docType === 'DELIVERY_CHALLAN';
    const isQuotation = docType === 'QUOTATION' || docType === 'ESTIMATE';

    let seqType = 'INV';
    if (isPurchase) seqType = 'BILL';
    else if (isCreditNote) seqType = 'CRN';
    else if (isDebitNote) seqType = 'DBN';
    else if (isDeliveryChallan) seqType = 'DC';
    else if (isQuotation) seqType = 'EST';

    const fy = fyCode();
    const key = `${seqType}-${fy}`;
    const seqDoc = await Sequence.findOne({ tenantId: req.tenantId, key }).lean();
    const nextVal = (seqDoc?.value || 0) + 1;
    const paddedSeq = String(nextVal).padStart(4, '0');
    const invoiceNumber = `${fy}-${paddedSeq}`;
    const fullVoucherNo = `${seqType}-${invoiceNumber}`;

    res.json({
      data: {
        prefix: seqType,
        financialYear: fy,
        sequenceValue: nextVal,
        paddedSeq,
        invoiceNumber,
        fullVoucherNo,
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

module.exports = { list, quickStock, create, createInvoice, getNextInvoiceNumber };
