'use strict';

const mongoose    = require('mongoose');
const Product     = require('../../models/inv/Product');
const StockLedger = require('../../models/inv/StockLedger');
const Warehouse   = require('../../models/inv/Warehouse');
const Supplier    = require('../../models/inv/Supplier');
const Customer    = require('../../models/inv/Customer');
const Tenant      = require('../../models/Tenant');
const PaymentTransaction = require('../../models/inv/PaymentTransaction');
const { getTenantId } = require('../../utils/tenant');

// ─── GET /api/inventory/reports/stock-summary ─────────────────────────────────
// Current stock per product (all warehouses combined or filtered by warehouse/category)
async function stockSummary(req, res, next) {
  try {
    const { warehouseId, categoryId } = req.query;

    const match = { tenantId: req.tenantId };
    if (warehouseId) match.warehouseId = new mongoose.Types.ObjectId(warehouseId);

    const stockAgg = await StockLedger.aggregate([
      { $match: match },
      { $group: { _id: '$productId', currentStock: { $sum: '$qty' }, totalCost: { $sum: '$totalCost' } } },
    ]);

    const stockMap = Object.fromEntries(stockAgg.map(s => [s._id.toString(), s]));

    const prodFilter = { tenantId: req.tenantId, deletedAt: null, isActive: true };
    if (categoryId) {
      const Category = require('../../models/inv/Category');
      const subCats = await Category.find({ tenantId: req.tenantId, parentId: categoryId, deletedAt: null }).select('_id');
      const catIds = [new mongoose.Types.ObjectId(categoryId), ...subCats.map(s => s._id)];
      prodFilter.categoryId = { $in: catIds };
    }
    const products = await Product.find(prodFilter).populate('categoryId', 'name icon').sort({ name: 1 }).lean();

    const result = products.map(p => {
      const s = stockMap[p._id.toString()] || { currentStock: 0, totalCost: 0 };
      const price = p.purchasePrice || p.mrp || p.sellingPrice || 0;
      return {
        ...p,
        currentStock: s.currentStock,
        stockValue: Math.round(s.currentStock * price),
        isLowStock: s.currentStock <= p.reorderLevel,
      };
    });

    res.json({ data: result, message: 'OK', errors: null });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/reports/stock-ledger/:productId ───────────────────────
async function stockLedger(req, res, next) {
  try {
    const { warehouseId, from, to } = req.query;
    const prodId = new mongoose.Types.ObjectId(req.params.productId);
    
    // 1. Fetch Product details
    const product = await Product.findOne({ _id: prodId, tenantId: req.tenantId })
      .populate('categoryId', 'name icon')
      .lean();

    if (!product) {
      return res.status(404).json({ data: null, message: 'Product not found', errors: null });
    }

    // 2. Fetch all historical stock movements for this product to calculate running balance & lifetime stats
    const allMatch = { tenantId: req.tenantId, productId: prodId };
    if (warehouseId) allMatch.warehouseId = new mongoose.Types.ObjectId(warehouseId);

    const allMovements = await StockLedger.find(allMatch)
      .populate('warehouseId', 'name code')
      .sort({ date: 1, createdAt: 1 })
      .lean();

    let runningStock = 0;
    let totalInwardQty = 0;
    let totalInwardCostSum = 0;
    let totalInwardCount = 0;
    let totalOutwardQty = 0;
    let totalOutwardCostSum = 0;

    const enrichedMovements = allMovements.map((m) => {
      const q = Number(m.qty) || 0;
      runningStock += q;

      const unitCost = Number(m.unitCost) || product.purchasePrice || 0;
      const movementValue = Math.abs(q) * unitCost;

      if (q > 0) {
        totalInwardQty += q;
        totalInwardCostSum += movementValue;
        totalInwardCount++;
      } else if (q < 0) {
        totalOutwardQty += Math.abs(q);
        totalOutwardCostSum += movementValue;
      }

      return {
        _id: m._id,
        date: m.date,
        txnType: m.txnType,
        warehouseId: m.warehouseId,
        batchNo: m.batchNo,
        expiryDate: m.expiryDate,
        qty: q,
        unitCost,
        movementValue,
        runningBalance: runningStock,
        remarks: m.remarks,
      };
    });

    // Compute average inward unit cost
    const avgInwardCost = totalInwardQty > 0 
      ? Math.round((totalInwardCostSum / totalInwardQty) * 100) / 100 
      : (product.purchasePrice || product.mrp || 0);

    const currentStock = runningStock;
    const stockValuation = Math.round(Math.max(0, currentStock) * (avgInwardCost || product.purchasePrice || 0));

    const stats = {
      currentStock,
      avgInwardCost,
      purchasePrice: product.purchasePrice || 0,
      sellingPrice: product.sellingPrice || 0,
      mrp: product.mrp || 0,
      reorderLevel: product.reorderLevel || 0,
      isLowStock: currentStock <= (product.reorderLevel || 0),
      totalInwardQty,
      totalInwardValue: totalInwardCostSum,
      totalOutwardQty,
      totalOutwardValue: totalOutwardCostSum,
      stockValuation,
      totalTransactionsCount: allMovements.length,
    };

    // Filter by date range if provided
    let filteredMovements = enrichedMovements;
    if (from || to) {
      const fromDate = from ? new Date(from) : null;
      const toDate = to ? new Date(to) : null;
      if (toDate) toDate.setHours(23, 59, 59, 999);

      filteredMovements = filteredMovements.filter(m => {
        const d = new Date(m.date);
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
        return true;
      });
    }

    // Return in reverse chronological order (newest first)
    const reversed = [...filteredMovements].reverse();

    res.json({
      data: {
        product: {
          _id: product._id,
          name: product.name,
          sku: product.sku,
          hsnCode: product.hsnCode || '',
          unit: product.unit || 'PCS',
          category: product.categoryId?.name || '',
          categoryIcon: product.categoryId?.icon || '📦',
          gstRate: product.gstRate ?? 18,
          description: product.description || '',
        },
        stats,
        entries: reversed,
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/reports/valuation ─────────────────────────────────────
// Stock value based on current stock and purchase cost
async function valuation(req, res, next) {
  try {
    const stockAgg = await StockLedger.aggregate([
      { $match: { tenantId: req.tenantId } },
      { $group: { _id: '$productId', currentStock: { $sum: '$qty' } } },
      { $match: { currentStock: { $gt: 0 } } },
    ]);

    const ids = stockAgg.map(s => s._id);
    const products = await Product.find({ _id: { $in: ids }, tenantId: req.tenantId, deletedAt: null }).lean();
    const prodMap = Object.fromEntries(products.map(p => [p._id.toString(), p]));

    const result = stockAgg.map(s => {
      const p = prodMap[s._id.toString()] || {};
      const unitPrice = p.purchasePrice || p.mrp || p.sellingPrice || 0;
      const stockVal = Math.round(s.currentStock * unitPrice);
      return {
        productId: s._id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        purchasePrice: p.purchasePrice || unitPrice,
        currentStock: s.currentStock,
        stockValue: stockVal,
      };
    });

    const totalValue = result.reduce((a, r) => a + r.stockValue, 0);
    res.json({ data: { items: result, totalValue }, message: 'OK', errors: null });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/reports/expiry-alerts ─────────────────────────────────
async function expiryAlerts(req, res, next) {
  try {
    const days = Number(req.query.days) || 30;
    const cutoff = new Date(Date.now() + days * 86400000);

    const alerts = await StockLedger.aggregate([
      { $match: { tenantId: req.tenantId, expiryDate: { $ne: null, $lte: cutoff } } },
      { $group: { _id: { productId: '$productId', batchNo: '$batchNo', expiryDate: '$expiryDate', warehouseId: '$warehouseId' }, qty: { $sum: '$qty' } } },
      { $match: { qty: { $gt: 0 } } },
      { $sort: { '_id.expiryDate': 1 } },
    ]);

    const prodIds = alerts.map(a => a._id.productId);
    const whIds   = alerts.map(a => a._id.warehouseId);
    const [prods, whs] = await Promise.all([
      Product.find({ _id: { $in: prodIds } }).select('name sku unit').lean(),
      Warehouse.find({ _id: { $in: whIds } }).select('name code').lean(),
    ]);

    const prodMap = Object.fromEntries(prods.map(p => [p._id.toString(), p]));
    const whMap   = Object.fromEntries(whs.map(w => [w._id.toString(), w]));

    const formatted = alerts.map(a => ({
      product: prodMap[a._id.productId?.toString()] || null,
      warehouse: whMap[a._id.warehouseId?.toString()] || null,
      batchNo: a._id.batchNo || '—',
      expiryDate: a._id.expiryDate,
      qty: a.qty,
      daysLeft: Math.ceil((new Date(a._id.expiryDate) - new Date()) / 86400000),
    }));

    res.json({ data: formatted, message: 'OK', errors: null });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/reports/dashboard-kpis ────────────────────────────────
async function dashboardKpis(req, res, next) {
  try {
    const targetTenantId = getTenantId(req);

    if (!targetTenantId) {
      return res.json({
        data: {
          total: { items: 0, suppliers: 0, customers: 0 },
          outstanding: {
            suppliers: { payed: 0, due: 0 },
            customers: { recieved: 0, due: 0 },
          },
          retail: {
            sales: { bills: 0, totalAmount: 0 },
            purchased: { bills: 0, totalAmount: 0 },
          },
          account: { cashBalance: 0, bankBalance: 0 },
          totalProducts: 0,
          lowStockProducts: 0,
          totalWarehouses: 0,
          stockValue: 0,
          recentActivity: [],
          overdueAlerts: [],
        },
        message: 'OK',
        errors: null,
      });
    }

    const [
      totalProducts,
      totalSuppliers,
      totalCustomers,
      lowStockCount,
      totalWarehouses,
      stockValAgg,
      recentActivity,
      outstandingAgg,
      retailTradingAgg,
      paymentsAgg,
      modeAgg,
      rawOverdue,
      rawTenantInfo,
    ] = await Promise.all([
      Product.countDocuments({ tenantId: targetTenantId, deletedAt: null, isActive: true }),
      Supplier.countDocuments({ tenantId: targetTenantId, deletedAt: null }),
      Customer.countDocuments({ tenantId: targetTenantId, deletedAt: null }),
      (async () => {
        const products = await Product.find({ tenantId: targetTenantId, deletedAt: null, isActive: true, reorderLevel: { $gt: 0 } }).lean();
        if (!products.length) return 0;
        const ids = products.map(p => p._id);
        const agg = await StockLedger.aggregate([
          { $match: { tenantId: targetTenantId, productId: { $in: ids } } },
          { $group: { _id: '$productId', qty: { $sum: '$qty' } } },
        ]);
        const map = Object.fromEntries(agg.map(a => [a._id.toString(), a.qty]));
        return products.filter(p => (map[p._id.toString()] || 0) <= p.reorderLevel).length;
      })(),
      Warehouse.countDocuments({ tenantId: targetTenantId, deletedAt: null, isActive: true }),
      (async () => {
        const products = await Product.find({ tenantId: targetTenantId, deletedAt: null }).select('purchasePrice mrp sellingPrice').lean();
        const prodMap = Object.fromEntries(products.map(p => [p._id.toString(), p.purchasePrice || p.mrp || p.sellingPrice || 0]));
        const agg = await StockLedger.aggregate([
          { $match: { tenantId: targetTenantId } },
          { $group: { _id: '$productId', qty: { $sum: '$qty' } } },
        ]);
        let sum = 0;
        for (const item of agg) {
          if (item.qty > 0) {
            sum += item.qty * (prodMap[item._id.toString()] || 0);
          }
        }
        return Math.round(sum);
      })(),
      StockLedger.find({ tenantId: targetTenantId })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('productId', 'name sku unit')
        .populate('warehouseId', 'name')
        .lean(),
      PaymentTransaction.aggregate([
        { $match: { tenantId: targetTenantId, txnType: { $in: ['INVOICE', 'BILL', 'OPENING_BAL'] } } },
        {
          $group: {
            _id: '$partyType',
            totalBilled: { $sum: '$amount' },
            totalSettled: { $sum: { $ifNull: ['$settledAmount', 0] } },
            totalDue: {
              $sum: {
                $cond: [
                  { $gt: [{ $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] }, 0] },
                  { $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] },
                  0,
                ],
              },
            },
          },
        },
      ]),
      PaymentTransaction.aggregate([
        { $match: { tenantId: targetTenantId, txnType: { $in: ['INVOICE', 'BILL'] } } },
        {
          $group: {
            _id: '$txnType',
            totalAmount: { $sum: '$amount' },
            billsCount: { $sum: 1 },
          },
        },
      ]),
      PaymentTransaction.aggregate([
        { $match: { tenantId: targetTenantId, txnType: { $in: ['PAYMENT_IN', 'PAYMENT_OUT', 'OUTSIDE_INFLOW', 'OUTSIDE_OUTFLOW'] } } },
        { $group: { _id: '$txnType', totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      PaymentTransaction.aggregate([
        { $match: { tenantId: targetTenantId, txnType: { $in: ['PAYMENT_IN', 'PAYMENT_OUT', 'OUTSIDE_INFLOW', 'OUTSIDE_OUTFLOW'] } } },
        { $group: { _id: { txnType: '$txnType', paymentMode: '$paymentMode' }, total: { $sum: '$amount' } } },
      ]),
      PaymentTransaction.find({
        tenantId: targetTenantId,
        dueDate: { $ne: null, $lt: new Date() },
        txnType: { $in: ['INVOICE', 'BILL'] },
        paymentStatus: { $ne: 'PAID' },
      })
        .sort({ dueDate: 1 })
        .limit(10)
        .populate('partyId', 'name phone contactName')
        .lean(),
      Tenant.findById(targetTenantId).select('initialWorkingCapital').lean(),
    ]);

    const tenantInfo = rawTenantInfo || {};
    const initialWorkingCapital = tenantInfo.initialWorkingCapital || 0;

    const supBillData = outstandingAgg.find(a => a._id === 'SUPPLIER');
    const custBillData = outstandingAgg.find(a => a._id === 'CUSTOMER');
    const salesBillData = retailTradingAgg.find(a => a._id === 'INVOICE');
    const purchBillData = retailTradingAgg.find(a => a._id === 'BILL');

    const payInTotal = paymentsAgg.find(a => a._id === 'PAYMENT_IN')?.totalAmount || 0;
    const payOutTotal = paymentsAgg.find(a => a._id === 'PAYMENT_OUT')?.totalAmount || 0;
    const outsideInTotal = paymentsAgg.find(a => a._id === 'OUTSIDE_INFLOW')?.totalAmount || 0;
    const outsideOutTotal = paymentsAgg.find(a => a._id === 'OUTSIDE_OUTFLOW')?.totalAmount || 0;

    let cashIn = 0, cashOut = 0, bankIn = 0, bankOut = 0;
    (modeAgg || []).forEach(m => {
      const mode = m._id?.paymentMode || '';
      const isCash = mode === 'CASH';
      const isBank = ['UPI', 'NEFT_RTGS', 'CHEQUE', 'NET_BANKING', 'CARD', 'ONLINE', 'BANK_TRANSFER'].includes(mode);
      const isInflow = m._id?.txnType === 'PAYMENT_IN' || m._id?.txnType === 'OUTSIDE_INFLOW';
      const isOutflow = m._id?.txnType === 'PAYMENT_OUT' || m._id?.txnType === 'OUTSIDE_OUTFLOW';

      if (isInflow) {
        if (isCash) cashIn += m.total;
        if (isBank) bankIn += m.total;
      } else if (isOutflow) {
        if (isCash) cashOut += m.total;
        if (isBank) bankOut += m.total;
      }
    });

    const overdueAlerts = (rawOverdue || []).map(b => ({
      _id: b._id,
      voucherNo: b.voucherNo,
      partyId: b.partyId?._id || b.partyId,
      partyName: b.partyId?.name || (b.partyType === 'CUSTOMER' ? 'Customer' : 'Supplier'),
      partyPhone: b.partyId?.phone || '',
      partyType: b.partyType,
      totalAmount: b.amount,
      pendingAmount: Math.max(0, b.amount - (b.settledAmount || 0)),
      daysOverdue: Math.max(1, Math.floor((Date.now() - new Date(b.dueDate)) / 86400000)),
      dueDate: b.dueDate,
    })).filter(b => b.pendingAmount > 0);

    const custDue = custBillData?.totalDue || 0;
    const supDue = supBillData?.totalDue || 0;

    res.json({
      data: {
        total: { items: totalProducts, suppliers: totalSuppliers, customers: totalCustomers },
        initialWorkingCapital,
        netWorkingCapital: initialWorkingCapital + custDue - supDue,
        outstanding: {
          suppliers: {
            payed: payOutTotal || (supBillData?.totalSettled || 0),
            due: supDue,
          },
          customers: {
            recieved: payInTotal || (custBillData?.totalSettled || 0),
            due: custDue,
          },
        },
        retail: {
          sales: { bills: salesBillData?.billsCount || 0, totalAmount: salesBillData?.totalAmount || 0 },
          purchased: { bills: purchBillData?.billsCount || 0, totalAmount: purchBillData?.totalAmount || 0 },
        },
        account: {
          cashBalance: cashIn - cashOut,
          bankBalance: bankIn - bankOut,
          cashIn,
          cashOut,
          bankIn,
          bankOut,
          outsideCashflow: {
            inflow: outsideInTotal,
            outflow: outsideOutTotal,
            net: outsideInTotal - outsideOutTotal,
          },
        },
        totalProducts,
        lowStockProducts: lowStockCount,
        totalWarehouses,
        stockValue: stockValAgg,
        recentActivity,
        overdueAlerts,
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/reports/bills-ledger ─────────────────────────────────
// Comprehensive All Invoices & Bills ledger with date range, type, status filter & stats
async function billsLedger(req, res, next) {
  try {
    const { from, to, type, status, partyType, partyId, search, paymentMode } = req.query;

    const match = {
      tenantId: req.tenantId,
      txnType: { $in: ['INVOICE', 'BILL'] },
    };

    // Filter by txnType (Sales Invoice vs Purchase Bill)
    if (type && type !== 'ALL') {
      if (type === 'SALES' || type === 'INVOICE') match.txnType = 'INVOICE';
      else if (type === 'PURCHASE' || type === 'BILL') match.txnType = 'BILL';
    }

    // Filter by Party Type
    if (partyType && partyType !== 'ALL') {
      match.partyType = partyType;
    }

    // Filter by Party Id
    if (partyId) {
      match.partyId = new mongoose.Types.ObjectId(partyId);
    }

    // Filter by Payment Mode
    if (paymentMode && paymentMode !== 'ALL') {
      match.paymentMode = paymentMode;
    }

    // Filter by Date Range — $or covers both paymentDate and date fields
    // setHours ensures full-day inclusivity regardless of stored time
    if (from || to) {
      const dateFilter = {};
      if (from) {
        const fromD = new Date(from);
        fromD.setHours(0, 0, 0, 0);
        dateFilter.$gte = fromD;
      }
      if (to) {
        const toD = new Date(to);
        toD.setHours(23, 59, 59, 999);
        dateFilter.$lte = toD;
      }
      match.$or = [
        { paymentDate: dateFilter },
        { date: dateFilter },
      ];
    }

    // Fetch all matching bills for this tenant
    const rawBills = await PaymentTransaction.find(match)
      .populate('partyId', 'name phone gstin email address')
      .populate('bankAccountId', 'bankName accountNumber')
      .sort({ paymentDate: -1, createdAt: -1 })
      .lean();

    const now = new Date();

    // Map bills and calculate dynamic status (including OVERDUE)
    let processedBills = rawBills.map(b => {
      const totalAmt = Number(b.amount) || 0;
      const settled = Number(b.settledAmount) || 0;
      const pending = Math.max(0, totalAmt - settled);
      
      let calcStatus = 'UNPAID';
      if (settled >= totalAmt && totalAmt > 0) {
        calcStatus = 'PAID';
      } else if (settled > 0) {
        calcStatus = 'PARTIAL';
      }

      let isOverdue = false;
      let daysOverdue = 0;
      if (calcStatus !== 'PAID' && b.dueDate && new Date(b.dueDate) < now) {
        daysOverdue = Math.floor((now - new Date(b.dueDate)) / 86400000);
        if (daysOverdue > 0) {
          isOverdue = true;
        }
      }

      const partyObj = b.partyId || {};
      const partyDisplayName = partyObj.name || b.partyName || (b.partyType === 'CUSTOMER' ? 'Customer' : 'Supplier');

      return {
        _id: b._id,
        voucherNo: b.voucherNo,
        txnType: b.txnType, // 'INVOICE' or 'BILL'
        partyType: b.partyType, // 'CUSTOMER' or 'SUPPLIER'
        partyId: partyObj._id || b.partyId,
        partyName: partyDisplayName,
        partyPhone: partyObj.phone || '',
        partyGstin: partyObj.gstin || '',
        partyEmail: partyObj.email || b.emailId || '',
        date: b.paymentDate,
        dueDate: b.dueDate,
        paymentMode: b.paymentMode || 'UPI',
        referenceNo: b.referenceNo || '',
        bankName: b.bankAccountId?.bankName || b.bankAccount || '',
        subtotal: Number(b.subtotal) || (totalAmt - (Number(b.taxTotal) || 0)),
        discountTotal: Number(b.discountTotal) || 0,
        taxTotal: Number(b.taxTotal) || 0,
        cgstTotal: Number(b.cgstTotal) || 0,
        sgstTotal: Number(b.sgstTotal) || 0,
        igstTotal: Number(b.igstTotal) || 0,
        amount: totalAmt,
        settledAmount: settled,
        pendingAmount: pending,
        advanceAmount: Number(b.advanceAmount) || 0,
        appliedAdvanceAmount: Number(b.appliedAdvanceAmount) || 0,
        paymentStatus: calcStatus,
        isOverdue,
        daysOverdue,
        itemsCount: Array.isArray(b.items) ? b.items.length : 0,
        items: b.items || [],
        notes: b.notes || '',
        supplyType: b.supplyType || 'INTRA',
      };
    });

    // Filter by Payment Status if requested
    if (status && status !== 'ALL') {
      if (status === 'OVERDUE') {
        processedBills = processedBills.filter(b => b.isOverdue && b.pendingAmount > 0);
      } else if (status === 'PAID') {
        processedBills = processedBills.filter(b => b.paymentStatus === 'PAID');
      } else if (status === 'PARTIAL' || status === 'PARTIALLY_PAID') {
        processedBills = processedBills.filter(b => b.paymentStatus === 'PARTIAL');
      } else if (status === 'UNPAID') {
        processedBills = processedBills.filter(b => b.paymentStatus === 'UNPAID');
      }
    }

    // Filter by text search if provided
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      processedBills = processedBills.filter(b => 
        (b.voucherNo && b.voucherNo.toLowerCase().includes(q)) ||
        (b.partyName && b.partyName.toLowerCase().includes(q)) ||
        (b.partyGstin && b.partyGstin.toLowerCase().includes(q)) ||
        (b.partyPhone && b.partyPhone.includes(q)) ||
        (b.referenceNo && b.referenceNo.toLowerCase().includes(q)) ||
        (b.items && b.items.some(it => (it.productName && it.productName.toLowerCase().includes(q)) || (it.sku && it.sku.toLowerCase().includes(q))))
      );
    }

    // Calculate aggregated stats across the filtered dataset
    let totalSalesAmount = 0;
    let totalPurchaseAmount = 0;
    let salesCount = 0;
    let purchasesCount = 0;
    let totalBilledAmount = 0;
    let totalTaxAmount = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalSettledAmount = 0;
    let totalBalanceDue = 0;
    let customerReceivableDue = 0;
    let supplierPayableDue = 0;
    let overdueBillsCount = 0;
    let overdueAmount = 0;
    let paidBillsCount = 0;
    let unpaidBillsCount = 0;
    let partialBillsCount = 0;

    processedBills.forEach(b => {
      totalBilledAmount += b.amount;
      totalTaxAmount += b.taxTotal;
      totalCgst += b.cgstTotal;
      totalSgst += b.sgstTotal;
      totalIgst += b.igstTotal;
      totalSettledAmount += b.settledAmount;
      totalBalanceDue += b.pendingAmount;

      if (b.txnType === 'INVOICE') {
        salesCount++;
        totalSalesAmount += b.amount;
        customerReceivableDue += b.pendingAmount;
      } else if (b.txnType === 'BILL') {
        purchasesCount++;
        totalPurchaseAmount += b.amount;
        supplierPayableDue += b.pendingAmount;
      }

      if (b.paymentStatus === 'PAID') paidBillsCount++;
      else if (b.paymentStatus === 'PARTIAL') partialBillsCount++;
      else unpaidBillsCount++;

      if (b.isOverdue && b.pendingAmount > 0) {
        overdueBillsCount++;
        overdueAmount += b.pendingAmount;
      }
    });

    const stats = {
      totalBillsCount: processedBills.length,
      salesCount,
      purchasesCount,
      totalBilledAmount,
      totalSalesAmount,
      totalPurchaseAmount,
      totalTaxAmount,
      totalCgst,
      totalSgst,
      totalIgst,
      totalSettledAmount,
      totalBalanceDue,
      customerReceivableDue,
      supplierPayableDue,
      overdueBillsCount,
      overdueAmount,
      paidBillsCount,
      unpaidBillsCount,
      partialBillsCount,
      totalAdvanceCredited: processedBills.reduce((s, b) => s + (b.advanceAmount || 0), 0),
      totalAdvanceApplied: processedBills.reduce((s, b) => s + (b.appliedAdvanceAmount || 0), 0),
    };

    res.json({
      data: {
        stats,
        bills: processedBills,
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/reports/gstr1 (GSTR-1 Statutory Return Data & Tables) ─
async function gstr1Report(req, res, next) {
  try {
    const { from, to } = req.query;
    const match = {
      tenantId: req.tenantId,
      txnType: { $in: ['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE'] },
    };

    if (from || to) {
      match.paymentDate = {};
      if (from) match.paymentDate.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        match.paymentDate.$lte = toDate;
      }
    }

    const docs = await PaymentTransaction.find(match)
      .populate('partyId', 'name gstin state stateCode billingAddress')
      .sort({ paymentDate: 1, voucherNo: 1 })
      .lean();

    const b2bInvoices = [];
    const b2clInvoices = [];
    const b2csSummary = {};
    const cdnrList = [];
    const hsnMap = {};
    const docMap = {};

    let totalTaxableValue = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalInvoiceValue = 0;

    for (const doc of docs) {
      const isCn = doc.txnType === 'CREDIT_NOTE';
      const isDn = doc.txnType === 'DEBIT_NOTE';
      const isInv = doc.txnType === 'INVOICE';
      const party = doc.partyId || {};
      const buyerGstin = (party.gstin || '').trim().toUpperCase();
      const isRegistered = Boolean(buyerGstin && buyerGstin.length === 15);
      const pos = party.stateCode || (doc.supplyType === 'INTER' ? '99' : '27');
      const docVal = doc.amount || 0;
      const taxVal = doc.subtotal - (doc.discountTotal || 0);

      // Track Document Series (Table 13)
      const prefix = (doc.voucherNo.split('-')[0] || doc.txnType);
      if (!docMap[prefix]) {
        docMap[prefix] = { docType: prefix, startNo: doc.voucherNo, endNo: doc.voucherNo, totalCount: 0, totalValue: 0 };
      }
      docMap[prefix].endNo = doc.voucherNo;
      docMap[prefix].totalCount++;
      docMap[prefix].totalValue += docVal;

      if (isInv) {
        totalTaxableValue += taxVal;
        totalCgst += (doc.cgstTotal || 0);
        totalSgst += (doc.sgstTotal || 0);
        totalIgst += (doc.igstTotal || 0);
        totalInvoiceValue += docVal;

        if (isRegistered) {
          // Table 4: B2B Invoices
          b2bInvoices.push({
            gstin: buyerGstin,
            buyerName: party.name || doc.partyName,
            invoiceNo: doc.voucherNo,
            invoiceDate: doc.paymentDate,
            invoiceValue: docVal,
            pos: pos,
            reverseCharge: doc.isRcm ? 'Y' : 'N',
            supplyType: doc.supplyType || 'INTRA',
            taxableValue: taxVal,
            cgst: doc.cgstTotal || 0,
            sgst: doc.sgstTotal || 0,
            igst: doc.igstTotal || 0,
          });
        } else if (doc.supplyType === 'INTER' && docVal > 250000) {
          // Table 5: B2C Large (> 2.5L Inter-state)
          b2clInvoices.push({
            buyerName: party.name || doc.partyName,
            invoiceNo: doc.voucherNo,
            invoiceDate: doc.paymentDate,
            invoiceValue: docVal,
            pos: pos,
            taxableValue: taxVal,
            igst: doc.igstTotal || 0,
          });
        } else {
          // Table 7: B2C Small (Aggregated by POS and Tax Slab)
          const slabKey = `${pos}_${doc.supplyType}`;
          if (!b2csSummary[slabKey]) {
            b2csSummary[slabKey] = {
              pos: pos,
              supplyType: doc.supplyType || 'INTRA',
              taxableValue: 0,
              cgst: 0,
              sgst: 0,
              igst: 0,
              totalValue: 0,
              invoiceCount: 0,
            };
          }
          b2csSummary[slabKey].taxableValue += taxVal;
          b2csSummary[slabKey].cgst += (doc.cgstTotal || 0);
          b2csSummary[slabKey].sgst += (doc.sgstTotal || 0);
          b2csSummary[slabKey].igst += (doc.igstTotal || 0);
          b2csSummary[slabKey].totalValue += docVal;
          b2csSummary[slabKey].invoiceCount++;
        }
      } else if (isCn || isDn) {
        // Table 9: Credit / Debit Notes
        cdnrList.push({
          noteType: isCn ? 'C' : 'D',
          noteNo: doc.voucherNo,
          noteDate: doc.paymentDate,
          originalInvoiceNo: doc.originalVoucherNo || '—',
          originalInvoiceDate: doc.originalInvoiceDate || null,
          buyerGstin: buyerGstin || 'URP',
          buyerName: party.name || doc.partyName,
          noteValue: docVal,
          taxableValue: taxVal,
          cgst: doc.cgstTotal || 0,
          sgst: doc.sgstTotal || 0,
          igst: doc.igstTotal || 0,
          reason: doc.reasonForReturn || 'Sales Return',
        });
      }

      // Table 12: HSN Summary across all line items
      if (Array.isArray(doc.items)) {
        for (const item of doc.items) {
          const hsn = (item.hsn || '9999').trim();
          if (!hsnMap[hsn]) {
            hsnMap[hsn] = {
              hsn: hsn,
              description: item.productName || 'Item',
              uqc: item.unit || 'PCS',
              totalQty: 0,
              totalValue: 0,
              taxableValue: 0,
              cgst: 0,
              sgst: 0,
              igst: 0,
            };
          }
          const sign = isCn ? -1 : 1;
          hsnMap[hsn].totalQty += sign * ((item.qty || 0) + (item.freeQty || 0));
          hsnMap[hsn].totalValue += sign * (item.amount || 0);
          hsnMap[hsn].taxableValue += sign * (item.taxableAmount || 0);
          hsnMap[hsn].cgst += sign * (item.cgstAmount || 0);
          hsnMap[hsn].sgst += sign * (item.sgstAmount || 0);
          hsnMap[hsn].igst += sign * (item.igstAmount || 0);
        }
      }
    }

    res.json({
      data: {
        period: { from: from || 'ALL', to: to || 'ALL' },
        totals: {
          totalInvoiceValue: Math.round(totalInvoiceValue * 100) / 100,
          totalTaxableValue: Math.round(totalTaxableValue * 100) / 100,
          totalCgst: Math.round(totalCgst * 100) / 100,
          totalSgst: Math.round(totalSgst * 100) / 100,
          totalIgst: Math.round(totalIgst * 100) / 100,
          totalTax: Math.round((totalCgst + totalSgst + totalIgst) * 100) / 100,
          invoiceCount: docs.length,
        },
        table4B2b: b2bInvoices,
        table5B2cl: b2clInvoices,
        table7B2cs: Object.values(b2csSummary),
        table9Cdnr: cdnrList,
        table12Hsn: Object.values(hsnMap),
        table13DocSummary: Object.values(docMap),
      },
      message: 'GSTR-1 report generated successfully',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/reports/gstr3b (GSTR-3B Monthly Tax Computation) ─────
async function gstr3bReport(req, res, next) {
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      dateFilter.$lte = toDate;
    }

    const txMatch = { tenantId: req.tenantId };
    if (from || to) txMatch.paymentDate = dateFilter;

    // 1. Outward Tax Liability (Table 3.1)
    const outwardAgg = await PaymentTransaction.aggregate([
      {
        $match: {
          ...txMatch,
          txnType: { $in: ['INVOICE', 'CREDIT_NOTE'] },
        },
      },
      {
        $group: {
          _id: '$txnType',
          taxable: { $sum: '$taxableAmount' },
          cgst: { $sum: '$cgstTotal' },
          sgst: { $sum: '$sgstTotal' },
          igst: { $sum: '$igstTotal' },
          total: { $sum: '$amount' },
        },
      },
    ]);

    let outTaxable = 0, outCgst = 0, outSgst = 0, outIgst = 0, outTotal = 0;
    outwardAgg.forEach(r => {
      const sign = r._id === 'CREDIT_NOTE' ? -1 : 1;
      outTaxable += sign * (r.taxable || 0);
      outCgst += sign * (r.cgst || 0);
      outSgst += sign * (r.sgst || 0);
      outIgst += sign * (r.igst || 0);
      outTotal += sign * (r.total || 0);
    });

    // 2. Inward Eligible Input Tax Credit (Table 4)
    const inwardAgg = await PaymentTransaction.aggregate([
      {
        $match: {
          ...txMatch,
          txnType: { $in: ['BILL', 'DEBIT_NOTE'] },
        },
      },
      {
        $group: {
          _id: '$txnType',
          taxable: { $sum: '$taxableAmount' },
          cgst: { $sum: '$cgstTotal' },
          sgst: { $sum: '$sgstTotal' },
          igst: { $sum: '$igstTotal' },
          total: { $sum: '$amount' },
        },
      },
    ]);

    let itcTaxable = 0, itcCgst = 0, itcSgst = 0, itcIgst = 0, itcTotal = 0;
    inwardAgg.forEach(r => {
      const sign = r._id === 'DEBIT_NOTE' ? -1 : 1;
      itcTaxable += sign * (r.taxable || 0);
      itcCgst += sign * (r.cgst || 0);
      itcSgst += sign * (r.sgst || 0);
      itcIgst += sign * (r.igst || 0);
      itcTotal += sign * (r.total || 0);
    });

    // Net Payable Liability
    const netCgstPayable = Math.max(0, outCgst - itcCgst);
    const netSgstPayable = Math.max(0, outSgst - itcSgst);
    const netIgstPayable = Math.max(0, outIgst - itcIgst);
    const totalCashPayable = netCgstPayable + netSgstPayable + netIgstPayable;

    // Remaining ITC Carry Forward
    const itcCarryForward = {
      cgst: Math.max(0, itcCgst - outCgst),
      sgst: Math.max(0, itcSgst - outSgst),
      igst: Math.max(0, itcIgst - outIgst),
    };

    res.json({
      data: {
        table31OutwardSupplies: {
          taxableValue: Math.round(outTaxable * 100) / 100,
          cgst: Math.round(outCgst * 100) / 100,
          sgst: Math.round(outSgst * 100) / 100,
          igst: Math.round(outIgst * 100) / 100,
          totalOutputTax: Math.round((outCgst + outSgst + outIgst) * 100) / 100,
          totalValue: Math.round(outTotal * 100) / 100,
        },
        table4EligibleItc: {
          taxableValue: Math.round(itcTaxable * 100) / 100,
          cgst: Math.round(itcCgst * 100) / 100,
          sgst: Math.round(itcSgst * 100) / 100,
          igst: Math.round(itcIgst * 100) / 100,
          totalItc: Math.round((itcCgst + itcSgst + itcIgst) * 100) / 100,
          totalValue: Math.round(itcTotal * 100) / 100,
        },
        netTaxPayable: {
          cgst: Math.round(netCgstPayable * 100) / 100,
          sgst: Math.round(netSgstPayable * 100) / 100,
          igst: Math.round(netIgstPayable * 100) / 100,
          totalCashPayable: Math.round(totalCashPayable * 100) / 100,
        },
        itcCarryForward,
      },
      message: 'GSTR-3B tax computation generated',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/reports/msme-compliance (Section 43B(h) MSME 45-Day Tracker)
async function msmeComplianceReport(req, res, next) {
  try {
    const now = new Date();

    // 1. Fetch all suppliers flagged as MICRO or SMALL
    const msmeSuppliers = await Supplier.find({
      tenantId: req.tenantId,
      deletedAt: null,
      msmeType: { $in: ['MICRO', 'SMALL'] },
    }).lean();

    const supplierMap = Object.fromEntries(msmeSuppliers.map(s => [s._id.toString(), s]));
    const supplierIds = msmeSuppliers.map(s => s._id);

    // 2. Fetch all open/partially paid purchase bills for these MSME suppliers
    const openBills = await PaymentTransaction.find({
      tenantId: req.tenantId,
      txnType: 'BILL',
      partyId: { $in: supplierIds },
      paymentStatus: { $in: ['UNPAID', 'PARTIALLY_PAID'] },
    })
      .sort({ paymentDate: 1 })
      .lean();

    let totalMsmePayable = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let atRiskDisallowanceAmount = 0;
    let totalEstimatedInterestPenalty = 0;

    const billsList = openBills.map(bill => {
      const sup = supplierMap[bill.partyId?.toString()] || {};
      const billDate = new Date(bill.paymentDate || bill.createdAt);
      const pendingAmount = Math.max(0, (bill.amount || 0) - (bill.settledAmount || 0));
      totalMsmePayable += pendingAmount;

      // Statutory limit: If written agreement exists, max 45 days; if no agreement, 15 days
      const statutoryDays = sup.msmeAgreedDays || 45;
      const statutoryDueDate = new Date(billDate.getTime() + statutoryDays * 86400000);
      const daysPassed = Math.floor((now.getTime() - billDate.getTime()) / 86400000);
      const daysRemaining = Math.floor((statutoryDueDate.getTime() - now.getTime()) / 86400000);
      const isOverdue = daysRemaining < 0;
      const overdueDays = isOverdue ? Math.abs(daysRemaining) : 0;

      // Compound interest under Section 16 MSMED Act: 3x RBI bank rate (~19.5% p.a.)
      const annualRate = 0.195;
      const monthlyRate = annualRate / 12;
      const monthsOverdue = overdueDays / 30;
      const interestPenalty = isOverdue
        ? Math.round((pendingAmount * Math.pow(1 + monthlyRate, monthsOverdue) - pendingAmount) * 100) / 100
        : 0;

      if (isOverdue) {
        overdueCount++;
        overdueAmount += pendingAmount;
        totalEstimatedInterestPenalty += interestPenalty;
        // Section 43B(h) Disallowance applies if outstanding past March 31st
        atRiskDisallowanceAmount += pendingAmount;
      }

      let status = 'SAFE';
      if (isOverdue) status = 'OVERDUE_DISALLOWANCE_RISK';
      else if (daysRemaining <= 7) status = 'DUE_SOON';

      return {
        _id: bill._id,
        voucherNo: bill.voucherNo,
        supplierName: sup.name || bill.partyName,
        supplierGstin: sup.gstin || '—',
        msmeType: sup.msmeType,
        udyamNumber: sup.udyamNumber || '—',
        billDate,
        statutoryDueDate,
        statutoryDays,
        daysPassed,
        daysRemaining: Math.max(0, daysRemaining),
        overdueDays,
        totalAmount: bill.amount,
        settledAmount: bill.settledAmount || 0,
        pendingAmount,
        interestPenalty,
        status,
      };
    });

    res.json({
      data: {
        summary: {
          totalMsmeSuppliers: msmeSuppliers.length,
          totalOpenBills: openBills.length,
          totalMsmePayable: Math.round(totalMsmePayable * 100) / 100,
          overdueCount,
          overdueAmount: Math.round(overdueAmount * 100) / 100,
          atRiskDisallowanceAmount: Math.round(atRiskDisallowanceAmount * 100) / 100,
          totalEstimatedInterestPenalty: Math.round(totalEstimatedInterestPenalty * 100) / 100,
        },
        bills: billsList,
      },
      message: 'MSME Section 43B(h) compliance report generated',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  stockSummary,
  stockLedger,
  valuation,
  expiryAlerts,
  dashboardKpis,
  billsLedger,
  gstr1Report,
  gstr3bReport,
  msmeComplianceReport,
};
