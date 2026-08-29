'use strict';

const mongoose          = require('mongoose');
const PaymentTransaction = require('../../models/inv/PaymentTransaction');
const BankAccount        = require('../../models/inv/BankAccount');
const Customer          = require('../../models/inv/Customer');
const Supplier          = require('../../models/inv/Supplier');
const Tenant            = require('../../models/Tenant');
const AuditLog          = require('../../models/AuditLog');
const { nextSeq }       = require('../../utils/sequence');
const { decrypt, mask } = require('../../utils/encryption');

// ─── GET /api/inventory/payments/pending-bills ────────────────────────────────
async function getPendingBills(req, res, next) {
  try {
    const { partyType, partyId } = req.query;

    if (!partyType || !['CUSTOMER', 'SUPPLIER'].includes(partyType)) {
      return res.status(400).json({ data: null, message: 'partyType must be CUSTOMER or SUPPLIER', errors: null });
    }
    if (!partyId) {
      return res.status(400).json({ data: null, message: 'partyId is required', errors: null });
    }

    const txnType = partyType === 'CUSTOMER' ? 'INVOICE' : 'BILL';
    const now = new Date();

    const bills = await PaymentTransaction.find({
      tenantId: req.tenantId,
      partyId: new mongoose.Types.ObjectId(partyId),
      txnType,
      $or: [
        { paymentStatus: { $in: ['UNPAID', 'PARTIALLY_PAID', null] } },
        { $expr: { $gt: ['$amount', { $ifNull: ['$settledAmount', 0] }] } },
      ],
    })
      .sort({ paymentDate: 1, createdAt: 1 })
      .lean();

    const pendingBills = bills.map(b => {
      const settled = b.settledAmount || 0;
      const pending = Math.max(0, b.amount - settled);
      let daysOverdue = 0;
      let status = settled > 0 ? 'PARTIALLY_PAID' : 'UNPAID';

      if (b.dueDate && new Date(b.dueDate) < now) {
        daysOverdue = Math.floor((now - new Date(b.dueDate)) / 86400000);
        if (daysOverdue > 0) status = 'OVERDUE';
      }

      return {
        _id: b._id,
        voucherNo: b.voucherNo,
        date: b.paymentDate,
        dueDate: b.dueDate,
        notes: b.notes,
        totalAmount: b.amount,
        settledAmount: settled,
        pendingAmount: pending,
        daysOverdue,
        status,
      };
    }).filter(b => b.pendingAmount > 0);

    const totalPending = pendingBills.reduce((acc, b) => acc + b.pendingAmount, 0);

    res.json({
      data: {
        bills: pendingBills,
        count: pendingBills.length,
        totalPending,
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── POST /api/inventory/payments (Record Bill-Wise / Standalone Payment) ─────
async function recordPayment(req, res, next) {
  try {
    const {
      partyType,
      partyId,
      amount,
      paymentMode,
      paymentDate,
      referenceNo,
      bankAccount,
      bankAccountId,
      notes,
      allocations, // Array of { billId, amount }
      autoKnockoff, // Boolean (FIFO knockoff)
    } = req.body;

    if (!partyType || !['CUSTOMER', 'SUPPLIER'].includes(partyType)) {
      return res.status(400).json({ data: null, message: 'partyType must be CUSTOMER or SUPPLIER', errors: null });
    }
    if (!partyId) {
      return res.status(400).json({ data: null, message: 'partyId is required', errors: null });
    }
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ data: null, message: 'Amount must be greater than 0', errors: null });
    }

    const Model = partyType === 'CUSTOMER' ? Customer : Supplier;
    const partyModel = partyType === 'CUSTOMER' ? 'InvCustomer' : 'InvSupplier';
    const party = await Model.findOne({ _id: partyId, tenantId: req.tenantId, deletedAt: null });
    if (!party) {
      return res.status(404).json({ data: null, message: `${partyType} not found`, errors: null });
    }

    const prefix = partyType === 'CUSTOMER' ? 'REC' : 'PAY';
    const voucherNo = await nextSeq(req.tenantId, prefix);
    const txnType = partyType === 'CUSTOMER' ? 'PAYMENT_IN' : 'PAYMENT_OUT';
    const targetBillType = partyType === 'CUSTOMER' ? 'INVOICE' : 'BILL';

    // ─── Overpayment & Outstanding Validation ────────────────────────────────
    // Calculate total open pending amount across all unpaid bills for this party
    const openBillsAgg = await PaymentTransaction.aggregate([
      {
        $match: {
          tenantId: req.tenantId,
          partyId: party._id,
          txnType: targetBillType,
          paymentStatus: { $in: ['UNPAID', 'PARTIALLY_PAID', null] },
        },
      },
      {
        $group: {
          _id: null,
          totalPending: {
            $sum: { $max: [0, { $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] }] },
          },
        },
      },
    ]);
    const totalPending = openBillsAgg[0]?.totalPending || 0;

    if (totalPending <= 0) {
      return res.status(400).json({
        data: null,
        message: `This ${partyType.toLowerCase()} has ₹0 outstanding balance. Cannot record a payment/receipt exceeding the total due.`,
        errors: null,
      });
    }

    if (numAmount > totalPending) {
      return res.status(400).json({
        data: null,
        message: `Payment amount (₹${numAmount.toLocaleString('en-IN')}) cannot exceed the total outstanding due of ₹${totalPending.toLocaleString('en-IN')}.`,
        errors: null,
      });
    }

    // ─── Bill-Wise Allocation Logic ──────────────────────────────────────────
    const allocatedBills = [];
    let remainingToAllocate = numAmount;

    if (Array.isArray(allocations) && allocations.length > 0) {
      // Validate total allocated doesn't exceed payment amount
      const sumAllocated = allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
      if (sumAllocated > numAmount) {
        return res.status(400).json({
          data: null,
          message: `Total allocated amount (₹${sumAllocated.toLocaleString('en-IN')}) cannot exceed payment amount of ₹${numAmount.toLocaleString('en-IN')}.`,
          errors: null,
        });
      }

      // Manual Allocations provided by user
      for (const item of allocations) {
        if (!item.billId || !item.amount || Number(item.amount) <= 0) continue;
        const allocAmt = Number(item.amount);

        const bill = await PaymentTransaction.findOne({
          _id: item.billId,
          tenantId: req.tenantId,
          partyId: party._id,
          txnType: targetBillType,
        });

        if (bill) {
          const currentSettled = bill.settledAmount || 0;
          const maxSettlable = Math.max(0, bill.amount - currentSettled);

          if (allocAmt > maxSettlable) {
            return res.status(400).json({
              data: null,
              message: `Allocation for bill ${bill.voucherNo} (₹${allocAmt.toLocaleString('en-IN')}) cannot exceed its remaining pending amount of ₹${maxSettlable.toLocaleString('en-IN')}.`,
              errors: null,
            });
          }

          const actualAlloc = Math.min(allocAmt, maxSettlable);

          if (actualAlloc > 0) {
            const newSettled = currentSettled + actualAlloc;
            const newStatus = newSettled >= bill.amount ? 'PAID' : 'PARTIALLY_PAID';
            const remainingBillBal = Math.max(0, bill.amount - newSettled);

            await PaymentTransaction.updateOne(
              { _id: bill._id },
              { $set: { settledAmount: newSettled, paymentStatus: newStatus } }
            );

            allocatedBills.push({
              billId: bill._id,
              voucherNo: bill.voucherNo,
              allocatedAmount: actualAlloc,
              remainingBillBalance: remainingBillBal,
            });

            remainingToAllocate -= actualAlloc;
          }
        }
      }
    } else if (autoKnockoff) {
      // Auto-FIFO Knockoff: Settle oldest unpaid bills first
      const openBills = await PaymentTransaction.find({
        tenantId: req.tenantId,
        partyId: party._id,
        txnType: targetBillType,
        $or: [
          { paymentStatus: { $in: ['UNPAID', 'PARTIALLY_PAID', null] } },
          { $expr: { $gt: ['$amount', { $ifNull: ['$settledAmount', 0] }] } },
        ],
      }).sort({ paymentDate: 1, createdAt: 1 });

      for (const bill of openBills) {
        if (remainingToAllocate <= 0) break;
        const currentSettled = bill.settledAmount || 0;
        const pendingOnBill = Math.max(0, bill.amount - currentSettled);
        if (pendingOnBill <= 0) continue;

        const actualAlloc = Math.min(remainingToAllocate, pendingOnBill);
        const newSettled = currentSettled + actualAlloc;
        const newStatus = newSettled >= bill.amount ? 'PAID' : 'PARTIALLY_PAID';
        const remainingBillBal = Math.max(0, bill.amount - newSettled);

        await PaymentTransaction.updateOne(
          { _id: bill._id },
          { $set: { settledAmount: newSettled, paymentStatus: newStatus } }
        );

        allocatedBills.push({
          billId: bill._id,
          voucherNo: bill.voucherNo,
          allocatedAmount: actualAlloc,
          remainingBillBalance: remainingBillBal,
        });

        remainingToAllocate -= actualAlloc;
      }
    }

    // Build descriptive notes
    let finalNotes = notes || (partyType === 'CUSTOMER' ? 'Payment received from customer' : 'Payment made to supplier');
    if (allocatedBills.length > 0) {
      const summaryText = allocatedBills.map(b => `${b.voucherNo} (₹${b.allocatedAmount.toLocaleString('en-IN')})`).join(', ');
      finalNotes = `${finalNotes} [Settled: ${summaryText}]`;
    }

    let resolvedBankAccountId = null;
    let resolvedBankAccountName = bankAccount || null;
    if (bankAccountId && mongoose.Types.ObjectId.isValid(bankAccountId)) {
      const bObj = await BankAccount.findOne({ _id: bankAccountId, tenantId: req.tenantId, deletedAt: null });
      if (bObj) {
        resolvedBankAccountId = bObj._id;
        resolvedBankAccountName = `${bObj.bankName} (****${(bObj.accountNumber || '').slice(-4)})`;
      }
    } else if (paymentMode !== 'CASH') {
      let defBank = await BankAccount.findOne({ tenantId: req.tenantId, deletedAt: null, isActive: true, isDefault: true }) || await BankAccount.findOne({ tenantId: req.tenantId, deletedAt: null, isActive: true });
      if (!defBank) {
        const randAcc = '5010' + Math.floor(10000000 + Math.random() * 90000000);
        defBank = await BankAccount.create({
          tenantId: req.tenantId,
          bankName: 'Main Business Bank A/C',
          accountName: 'Primary Operating Account',
          accountNumber: randAcc,
          ifscCode: 'HDFC0000123',
          branchName: 'Main Branch',
          accountType: 'CURRENT',
          upiId: '',
          openingBalance: 0,
          isDefault: true,
          isActive: true,
          notes: 'Default operational bank account. You can edit this bank name, account number, and details anytime in Finance Master.',
        });
      }
      if (defBank) {
        resolvedBankAccountId = defBank._id;
        const plainAcc = decrypt(defBank.accountNumber);
        resolvedBankAccountName = `${defBank.bankName} (****${plainAcc.slice(-4)})`;
      }
    }

    const isCashMode = (paymentMode || 'UPI') === 'CASH';
    const acctDisplayName = isCashMode ? 'Cash in Hand' : (resolvedBankAccountName || 'Bank Account');
    const sourceName = partyType === 'CUSTOMER' ? party.name : acctDisplayName;
    const destinationName = partyType === 'CUSTOMER' ? acctDisplayName : party.name;

    const modeToUse = paymentMode || 'UPI';
    const rand6 = Math.floor(100000 + Math.random() * 900000);
    const rand12 = Math.floor(100000000000 + Math.random() * 900000000000);
    let autoRef = `TXN-${rand6}`;
    if (modeToUse === 'UPI') autoRef = `UPI/${rand12}@okhdfc`;
    else if (modeToUse === 'NEFT_RTGS') autoRef = `HDFCN${rand6}`;
    else if (modeToUse === 'NET_BANKING') autoRef = `IMPS-${rand12}`;
    else if (modeToUse === 'CHEQUE') autoRef = `CHQ-${rand6}`;
    else if (modeToUse === 'CARD') autoRef = `POS-TXN-${rand6}`;
    else if (modeToUse === 'CASH') autoRef = `CASH-RCPT-${rand6}`;

    const finalRef = referenceNo ? referenceNo.trim() : autoRef;

    const txn = await PaymentTransaction.create({
      tenantId: req.tenantId,
      voucherNo,
      partyType,
      partyId: party._id,
      partyModel,
      txnType,
      amount: numAmount,
      paymentMode: modeToUse,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      referenceNo: finalRef,
      bankAccount: resolvedBankAccountName,
      bankAccountId: resolvedBankAccountId,
      sourceName,
      destinationName,
      transferType: partyType === 'CUSTOMER' ? 'PARTY_RECEIPT' : 'PARTY_PAYMENT',
      notes: finalNotes,
      allocatedBills,
      createdBy: req.user._id,
    });

    // Compute updated balance using actual remaining amounts on open bills/invoices
    const remainingOpenAgg = await PaymentTransaction.aggregate([
      {
        $match: {
          tenantId: req.tenantId,
          partyId: party._id,
          txnType: targetBillType,
          paymentStatus: { $in: ['UNPAID', 'PARTIALLY_PAID', null] },
        },
      },
      {
        $group: {
          _id: null,
          totalRemaining: {
            $sum: { $max: [0, { $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] }] },
          },
        },
      },
    ]);
    const updatedOutstanding = remainingOpenAgg[0]?.totalRemaining || 0;

    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: txnType,
      resource: 'payments',
      resourceId: txn._id.toString(),
      details: { voucherNo, partyName: party.name, amount: numAmount, paymentMode, referenceNo, updatedOutstanding, allocatedBills },
      ip: req.ip,
    });

    res.status(201).json({
      data: {
        txn,
        partyOutstanding: Math.max(0, updatedOutstanding),
        allocatedBills,
        unallocatedAmount: Math.max(0, remainingToAllocate),
      },
      message: `Payment Voucher ${voucherNo} recorded successfully. Current Outstanding: ₹${Math.max(0, updatedOutstanding).toLocaleString('en-IN')}`,
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── POST /api/inventory/payments/outside-cashflow (Add / Subtract Account Balance via Outside Cashflow) ─
async function recordOutsideCashflow(req, res, next) {
  try {
    const {
      direction, // 'ADD' (Inflow) or 'SUBTRACT' (Outflow)
      amount,
      paymentMode = 'CASH',
      category = 'OTHER_INFLOW',
      partyName = '',
      referenceNo = '',
      bankAccount = '',
      bankAccountId,
      notes = '',
      paymentDate,
    } = req.body;

    const rawTenant = req.query?.tenantId || req.headers?.['x-tenant-id'];
    const targetTenantId = (rawTenant && req.isSuperAdmin)
      ? new mongoose.Types.ObjectId(rawTenant)
      : (req.tenantId ? new mongoose.Types.ObjectId(req.tenantId) : null);

    if (!targetTenantId) {
      return res.status(400).json({ data: null, message: 'Tenant ID is required', errors: null });
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ data: null, message: 'Amount must be greater than 0', errors: null });
    }

    const isAdd = String(direction).toUpperCase() === 'ADD' || direction === 'INFLOW' || direction === '+';
    const txnType = isAdd ? 'OUTSIDE_INFLOW' : 'OUTSIDE_OUTFLOW';
    const prefix = isAdd ? 'ADJ-IN' : 'ADJ-OUT';

    const voucherNo = await nextSeq(targetTenantId, prefix);

    const validModes = ['UPI', 'NEFT_RTGS', 'CHEQUE', 'CASH', 'NET_BANKING', 'CARD', 'TRANSFER'];
    const validMode = validModes.includes(paymentMode) ? paymentMode : 'CASH';

    let resolvedBankAccountId = null;
    let resolvedBankAccountName = bankAccount ? bankAccount.trim() : null;

    if (bankAccountId && mongoose.Types.ObjectId.isValid(bankAccountId)) {
      const bObj = await BankAccount.findOne({ _id: bankAccountId, tenantId: targetTenantId, deletedAt: null });
      if (bObj) {
        resolvedBankAccountId = bObj._id;
        const plainAcc = decrypt(bObj.accountNumber);
        resolvedBankAccountName = `${bObj.bankName} (****${plainAcc.slice(-4)})`;
      }
    } else if (validMode !== 'CASH') {
      const defBank = await BankAccount.findOne({ tenantId: targetTenantId, deletedAt: null, isActive: true, isDefault: true })
        || await BankAccount.findOne({ tenantId: targetTenantId, deletedAt: null, isActive: true });
      if (defBank) {
        resolvedBankAccountId = defBank._id;
        const plainAcc = decrypt(defBank.accountNumber);
        resolvedBankAccountName = `${defBank.bankName} (****${plainAcc.slice(-4)})`;
      }
    }

    const isCashMode = validMode === 'CASH';
    const accountDisplayName = isCashMode ? 'Cash Register' : (resolvedBankAccountName || 'Bank Account');
    const pName = partyName ? partyName.trim() : (isAdd ? 'External Capital / Inflow' : 'Operating Expense / Outflow');
    const sourceName = isAdd ? pName : accountDisplayName;
    const destinationName = isAdd ? accountDisplayName : pName;

    const rand6_oc = Math.floor(100000 + Math.random() * 900000);
    const rand12_oc = Math.floor(100000000000 + Math.random() * 900000000000);
    let autoRef_oc = `TXN-${rand6_oc}`;
    if (validMode === 'UPI') autoRef_oc = `UPI/${rand12_oc}@okhdfc`;
    else if (validMode === 'NEFT_RTGS') autoRef_oc = `HDFCN${rand6_oc}`;
    else if (validMode === 'NET_BANKING') autoRef_oc = `IMPS-${rand12_oc}`;
    else if (validMode === 'CHEQUE') autoRef_oc = `CHQ-${rand6_oc}`;
    else if (validMode === 'CARD') autoRef_oc = `POS-TXN-${rand6_oc}`;
    else if (validMode === 'CASH') autoRef_oc = `CASH-RCPT-${rand6_oc}`;

    const finalRef = referenceNo ? referenceNo.trim() : autoRef_oc;

    const txn = await PaymentTransaction.create({
      tenantId: targetTenantId,
      voucherNo,
      partyType: 'OTHER',
      partyId: null,
      partyModel: null,
      partyName: pName,
      txnType,
      isOutsideCashflow: true,
      cashflowCategory: category,
      amount: numAmount,
      paymentMode: validMode,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      referenceNo: finalRef,
      bankAccount: resolvedBankAccountName,
      bankAccountId: resolvedBankAccountId,
      sourceName,
      destinationName,
      transferType: isAdd ? 'OUTSIDE_INFLOW' : 'OUTSIDE_OUTFLOW',
      notes: notes ? notes.trim() : (isAdd ? `Outside Cash Inflow: ${category}` : `Outside Cash Outflow: ${category}`),
      createdBy: req.user?._id || req.userId,
    });

    if (AuditLog) {
      await AuditLog.create({
        tenantId: targetTenantId,
        userId: req.user?._id || req.userId,
        action: txnType,
        resource: 'payments',
        resourceId: txn._id.toString(),
        details: { voucherNo, direction: isAdd ? 'ADD' : 'SUBTRACT', amount: numAmount, paymentMode: validMode, category, partyName },
        ip: req.ip,
      });
    }

    res.status(201).json({
      data: txn,
      message: `${isAdd ? 'Added' : 'Subtracted'} ₹${numAmount.toLocaleString('en-IN')} ${isAdd ? 'to' : 'from'} ${validMode === 'CASH' ? 'Cash in Hand' : 'Bank / UPI'} balance successfully (Voucher: ${voucherNo}).`,
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/payments/daily-summary (Per-Day Payment & Inflow/Outflow)
async function getDailySummary(req, res, next) {
  try {
    const { days = 30 } = req.query;
    const numDays = Math.min(90, Math.max(7, Number(days)));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);
    startDate.setHours(0, 0, 0, 0);

    const agg = await PaymentTransaction.aggregate([
      {
        $match: {
          tenantId: req.tenantId,
          paymentDate: { $gte: startDate },
          txnType: { $in: ['PAYMENT_IN', 'PAYMENT_OUT', 'OUTSIDE_INFLOW', 'OUTSIDE_OUTFLOW'] },
        },
      },
      {
        $group: {
          _id: {
            dateStr: { $dateToString: { format: '%Y-%m-%d', date: '$paymentDate', timezone: '+05:30' } },
            txnType: '$txnType',
            paymentMode: '$paymentMode',
          },
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.dateStr': -1 } },
    ]);

    // Group by date
    const dailyMap = {};
    const todayStr = new Date().toISOString().split('T')[0];

    agg.forEach(item => {
      const d = item._id.dateStr;
      if (!dailyMap[d]) {
        dailyMap[d] = {
          date: d,
          totalInflow: 0,
          totalOutflow: 0,
          netCashflow: 0,
          inflowCount: 0,
          outflowCount: 0,
          modes: {},
        };
      }
      const isReceipt = item._id.txnType === 'PAYMENT_IN' || item._id.txnType === 'OUTSIDE_INFLOW';
      if (isReceipt) {
        dailyMap[d].totalInflow += item.totalAmount;
        dailyMap[d].inflowCount += item.count;
      } else {
        dailyMap[d].totalOutflow += item.totalAmount;
        dailyMap[d].outflowCount += item.count;
      }
      dailyMap[d].netCashflow = dailyMap[d].totalInflow - dailyMap[d].totalOutflow;

      const mode = item._id.paymentMode || 'OTHER';
      dailyMap[d].modes[mode] = (dailyMap[d].modes[mode] || 0) + item.totalAmount;
    });

    const dailyList = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));
    const todaySummary = dailyMap[todayStr] || {
      date: todayStr,
      totalInflow: 0,
      totalOutflow: 0,
      netCashflow: 0,
      inflowCount: 0,
      outflowCount: 0,
      modes: {},
    };

    res.json({
      data: {
        daily: dailyList,
        today: todaySummary,
        totalDays: dailyList.length,
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/companies (Accessible Companies for Inventory/Outstandings) ─
async function getAccessibleCompanies(req, res, next) {
  try {
    if (req.isSuperAdmin) {
      const companies = await Tenant.find({ deletedAt: null }).sort({ name: 1 }).select('name email phone gst status address').lean();
      return res.json({ data: companies, message: 'OK', errors: null });
    }
    const myTenant = await Tenant.findById(req.tenantId).select('name email phone gst status address').lean();
    return res.json({ data: myTenant ? [myTenant] : [], message: 'OK', errors: null });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/payments/kpis (Overall Receivables & Payables & Account Balances) ─
async function getPaymentKpis(req, res, next) {
  try {
    const targetTenantId = (req.query.tenantId && req.isSuperAdmin) ? new mongoose.Types.ObjectId(req.query.tenantId) : req.tenantId;
    const now = new Date();

    // Parallel aggregate for unpaids, overdues, mode liquidity, and outside cashflows
    const [unpaidAgg, overdueAgg, modeAgg, paymentsAgg, custPartiesCount, supPartiesCount] = await Promise.all([
      PaymentTransaction.aggregate([
        {
          $match: {
            tenantId: targetTenantId,
            txnType: { $in: ['INVOICE', 'BILL', 'OPENING_BAL'] },
          },
        },
        {
          $group: {
            _id: '$partyType',
            unpaidTotal: {
              $sum: {
                $cond: [
                  { $gt: [{ $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] }, 0] },
                  { $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] },
                  0,
                ],
              },
            },
            totalBilled: { $sum: '$amount' },
            totalSettled: { $sum: { $ifNull: ['$settledAmount', 0] } },
            count: { $sum: 1 },
          },
        },
      ]),
      PaymentTransaction.aggregate([
        {
          $match: {
            tenantId: targetTenantId,
            dueDate: { $ne: null, $lt: now },
            txnType: { $in: ['INVOICE', 'BILL'] },
          },
        },
        {
          $group: {
            _id: '$partyType',
            overdueAmount: {
              $sum: {
                $cond: [
                  { $gt: [{ $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] }, 0] },
                  { $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] },
                  0,
                ],
              },
            },
            criticalAmount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $lt: ['$dueDate', new Date(now.getTime() - 30 * 86400000)] },
                      { $gt: [{ $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] }, 0] },
                    ],
                  },
                  { $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] },
                  0,
                ],
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      PaymentTransaction.aggregate([
        {
          $match: {
            tenantId: targetTenantId,
            txnType: { $in: ['PAYMENT_IN', 'PAYMENT_OUT', 'OUTSIDE_INFLOW', 'OUTSIDE_OUTFLOW'] },
          },
        },
        {
          $group: {
            _id: { txnType: '$txnType', paymentMode: '$paymentMode' },
            total: { $sum: '$amount' },
          },
        },
      ]),
      PaymentTransaction.aggregate([
        {
          $match: {
            tenantId: targetTenantId,
            txnType: { $in: ['PAYMENT_IN', 'PAYMENT_OUT', 'OUTSIDE_INFLOW', 'OUTSIDE_OUTFLOW'] },
          },
        },
        {
          $group: {
            _id: '$txnType',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
      PaymentTransaction.distinct('partyId', {
        tenantId: targetTenantId,
        partyType: 'CUSTOMER',
        txnType: { $in: ['INVOICE', 'OPENING_BAL'] },
        $expr: { $gt: ['$amount', { $ifNull: ['$settledAmount', 0] }] },
      }),
      PaymentTransaction.distinct('partyId', {
        tenantId: targetTenantId,
        partyType: 'SUPPLIER',
        txnType: { $in: ['BILL', 'OPENING_BAL'] },
        $expr: { $gt: ['$amount', { $ifNull: ['$settledAmount', 0] }] },
      }),
    ]);

    const totalReceivables = unpaidAgg.find(a => a._id === 'CUSTOMER')?.unpaidTotal || 0;
    const totalPayables    = unpaidAgg.find(a => a._id === 'SUPPLIER')?.unpaidTotal || 0;

    const custOverdue = overdueAgg.find(a => a._id === 'CUSTOMER');
    const supOverdue  = overdueAgg.find(a => a._id === 'SUPPLIER');

    const overdueReceivables  = custOverdue?.overdueAmount || 0;
    const overduePayables     = supOverdue?.overdueAmount || 0;
    const criticalReceivables = custOverdue?.criticalAmount || 0;
    const criticalPayables    = supOverdue?.criticalAmount || 0;

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

    const cashBalance = cashIn - cashOut;
    const bankBalance = bankIn - bankOut;
    const totalLiquidCapital = cashBalance + bankBalance;

    const tenant = await Tenant.findById(targetTenantId).select('initialWorkingCapital').lean();
    const initialWorkingCapital = tenant?.initialWorkingCapital || 0;
    const netTradeCapital = totalReceivables - totalPayables;
    const netWorkingCapital = initialWorkingCapital + netTradeCapital;

    res.json({
      data: {
        totalReceivables,
        totalPayables,
        overdueReceivables: Math.min(totalReceivables, overdueReceivables),
        overduePayables: Math.min(totalPayables, overduePayables),
        criticalReceivables: Math.min(totalReceivables, criticalReceivables),
        criticalPayables: Math.min(totalPayables, criticalPayables),
        initialWorkingCapital,
        netTradeCapital,
        netWorkingCapital,
        cashBalance,
        bankBalance,
        cashIn,
        cashOut,
        bankIn,
        bankOut,
        totalLiquidCapital,
        outsideCashflow: {
          inflow: outsideInTotal,
          outflow: outsideOutTotal,
          net: outsideInTotal - outsideOutTotal,
        },
        activeDebtorsCount: custPartiesCount.length,
        activeCreditorsCount: supPartiesCount.length,
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── PUT /api/inventory/payments/initial-working-capital (Set/Adjust Base Working Capital) ─
async function updateInitialWorkingCapital(req, res, next) {
  try {
    const { amount, alsoInjectToAccounts, accountMode = 'CASH', notes = '' } = req.body;
    const rawTenant = req.query.tenantId || req.headers['x-tenant-id'];
    const targetTenantId = (rawTenant && req.isSuperAdmin)
      ? new mongoose.Types.ObjectId(rawTenant)
      : (req.tenantId ? new mongoose.Types.ObjectId(req.tenantId) : null);

    if (!targetTenantId) {
      return res.status(400).json({ data: null, message: 'Tenant ID is required', errors: null });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ data: null, message: 'Amount must be a valid non-negative number', errors: null });
    }

    const tenant = await Tenant.findByIdAndUpdate(
      targetTenantId,
      { initialWorkingCapital: numAmount },
      { new: true }
    );

    // If requested to also inject as cash/bank opening balance:
    if (alsoInjectToAccounts && numAmount > 0) {
      const validMode = ['CASH', 'UPI', 'NEFT_RTGS', 'CHEQUE'].includes(accountMode) ? accountMode : 'CASH';
      const voucherNo = await nextSeq(targetTenantId, 'OPEN-CAP');
      await PaymentTransaction.create({
        tenantId: targetTenantId,
        voucherNo,
        partyType: 'OTHER',
        partyName: 'Owner Initial Capital Fund',
        txnType: 'OUTSIDE_INFLOW',
        isOutsideCashflow: true,
        cashflowCategory: 'CAPITAL_INJECTION',
        amount: numAmount,
        paymentMode: validMode,
        paymentDate: new Date(),
        notes: notes ? notes.trim() : 'Initial Working Capital & Capital Fund Injection',
        createdBy: req.user?._id || req.userId,
      });
    }

    if (AuditLog) {
      await AuditLog.create({
        tenantId: targetTenantId,
        userId: req.user?._id || req.userId,
        action: 'UPDATE_WORKING_CAPITAL',
        resource: 'tenants',
        resourceId: targetTenantId.toString(),
        details: { initialWorkingCapital: numAmount, alsoInjectToAccounts, accountMode },
        ip: req.ip,
      });
    }

    res.json({
      data: {
        initialWorkingCapital: tenant.initialWorkingCapital,
      },
      message: `Initial Working Capital set to ₹${numAmount.toLocaleString('en-IN')} successfully.`,
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

async function getOutstandings(req, res, next) {
  try {
    const { type = 'CUSTOMER', search } = req.query;
    if (!['CUSTOMER', 'SUPPLIER'].includes(type)) {
      return res.status(400).json({ data: null, message: 'type must be CUSTOMER or SUPPLIER', errors: null });
    }

    const targetTenantId = (req.query.tenantId && req.isSuperAdmin) ? new mongoose.Types.ObjectId(req.query.tenantId) : req.tenantId;
    const Model = type === 'CUSTOMER' ? Customer : Supplier;
    const filter = { tenantId: targetTenantId, deletedAt: null, isActive: { $ne: false } };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { gstin: { $regex: search, $options: 'i' } },
      ];
    }

    const parties = await Model.find(filter).sort({ name: 1 }).lean();
    const partyIds = parties.map(p => p._id);

    // Bill types that CREATE the outstanding (what the party owes or is owed)
    const billTypes = type === 'CUSTOMER' ? ['INVOICE', 'OPENING_BAL'] : ['BILL', 'OPENING_BAL'];
    // Payment types that SETTLE outstanding
    const payTypes  = type === 'CUSTOMER' ? ['PAYMENT_IN'] : ['PAYMENT_OUT'];
    const now = new Date();

    // ── Calculate outstanding PER-BILL using settledAmount ───────────────────
    const billAgg = await PaymentTransaction.aggregate([
      {
        $match: {
          tenantId: targetTenantId,
          partyId: { $in: partyIds },
          txnType: { $in: billTypes },
        },
      },
      {
        $group: {
          _id: '$partyId',
          outstanding: {
            $sum: {
              $cond: [
                { $gt: [{ $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] }, 0] },
                { $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] },
                0,
              ],
            },
          },
          totalBilled: { $sum: '$amount' },
          lastBillDate: { $max: '$paymentDate' },
          earliestDueDate: { $min: '$dueDate' },
          latestDueDate:   { $max: '$dueDate' },
          hasOverdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$dueDate', null] },
                    { $lt: ['$dueDate', now] },
                    { $gt: [{ $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] }, 0] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          maxDaysOverdue: {
            $max: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$dueDate', null] },
                    { $lt: ['$dueDate', now] },
                    { $gt: [{ $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] }, 0] },
                  ],
                },
                { $ceil: { $divide: [{ $subtract: [now, '$dueDate'] }, 86400000] } },
                0,
              ],
            },
          },
          daysTillDue: {
            $min: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$dueDate', null] },
                    { $gte: ['$dueDate', now] },
                    { $gt: [{ $subtract: ['$amount', { $ifNull: ['$settledAmount', 0] }] }, 0] },
                  ],
                },
                { $ceil: { $divide: [{ $subtract: ['$dueDate', now] }, 86400000] } },
                999,
              ],
            },
          },
        },
      },
    ]);

    // Also get total paid (for display: "Total Settled" column)
    const payAgg = await PaymentTransaction.aggregate([
      { $match: { tenantId: targetTenantId, partyId: { $in: partyIds }, txnType: { $in: payTypes } } },
      { $group: { _id: '$partyId', totalPaid: { $sum: '$amount' }, lastPayDate: { $max: '$paymentDate' } } },
    ]);

    // Also get total gross billed (for "Total Invoiced" display column — all bills ever)
    const allBillAgg = await PaymentTransaction.aggregate([
      { $match: { tenantId: targetTenantId, partyId: { $in: partyIds }, txnType: { $in: billTypes } } },
      { $group: { _id: '$partyId', totalBilledAll: { $sum: '$amount' }, lastTxnDate: { $max: '$paymentDate' } } },
    ]);

    // Fetch open bills details for each party for quick drilldown
    const openBillsRaw = await PaymentTransaction.find({
      tenantId: targetTenantId,
      partyId: { $in: partyIds },
      txnType: { $in: billTypes },
    }).sort({ paymentDate: -1, createdAt: -1 }).lean();

    const openBillsByParty = {};
    openBillsRaw.forEach(b => {
      const pid = b.partyId.toString();
      if (!openBillsByParty[pid]) openBillsByParty[pid] = [];
      const pendingAmt = Math.max(0, b.amount - (b.settledAmount || 0));
      if (pendingAmt > 0) {
        openBillsByParty[pid].push({
          _id: b._id,
          voucherNo: b.voucherNo,
          date: b.paymentDate,
          dueDate: b.dueDate,
          totalAmount: b.amount,
          settledAmount: b.settledAmount || 0,
          pendingAmount: pendingAmt,
          status: b.paymentStatus || 'UNPAID',
          isOverdue: b.dueDate ? new Date(b.dueDate) < now : false,
          overdueDays: (b.dueDate && new Date(b.dueDate) < now) ? Math.ceil((now - new Date(b.dueDate)) / 86400000) : 0,
        });
      }
    });

    const billMap    = Object.fromEntries(billAgg.map(b => [b._id.toString(), b]));
    const payMap     = Object.fromEntries(payAgg.map(p => [p._id.toString(), p]));
    const allBillMap = Object.fromEntries(allBillAgg.map(b => [b._id.toString(), b]));

    const result = parties.map(party => {
      const id = party._id.toString();
      const bStats  = billMap[id]    || { outstanding: 0, totalBilled: 0 };
      const pStats  = payMap[id]     || { totalPaid: 0, lastPayDate: null };
      const abStats = allBillMap[id] || { totalBilledAll: 0, lastTxnDate: null };
      const myOpenBills = openBillsByParty[id] || [];

      // Per-bill outstanding (sum of unpaid remainder on each open bill)
      const outstanding = bStats.outstanding || 0;
      const creditTerms = party.paymentTerms || (type === 'CUSTOMER' ? 15 : 30);
      const lastTxnDate = abStats.lastTxnDate || pStats.lastPayDate;

      let status = 'CLEARED';
      let daysOverdue = 0;

      if (outstanding > 0) {
        if (bStats.hasOverdue > 0) {
          daysOverdue = bStats.maxDaysOverdue || 0;
          status = daysOverdue > 30 ? 'CRITICAL' : 'OVERDUE';
        } else if (bStats.daysTillDue !== undefined && bStats.daysTillDue <= 3 && bStats.daysTillDue < 999) {
          status = 'DUE_SOON';
        } else if (bStats.earliestDueDate) {
          status = 'CURRENT';
        } else {
          if (lastTxnDate) {
            const daysElapsed = Math.floor((now - new Date(lastTxnDate)) / 86400000);
            daysOverdue = Math.max(0, daysElapsed - creditTerms);
            if (daysOverdue > 0) {
              status = daysOverdue > 30 ? 'CRITICAL' : 'OVERDUE';
            } else if (creditTerms - daysElapsed <= 3) {
              status = 'DUE_SOON';
            } else {
              status = 'CURRENT';
            }
          } else {
            status = 'CURRENT';
          }
        }
      }

      // Compute aging bucket for filtering: 0-15, 16-30, 31-60, 60+
      let agingBucket = 'CLEARED';
      if (outstanding > 0) {
        if (daysOverdue <= 0) agingBucket = 'CURRENT_0_15';
        else if (daysOverdue <= 15) agingBucket = 'CURRENT_0_15';
        else if (daysOverdue <= 30) agingBucket = 'DUE_16_30';
        else if (daysOverdue <= 60) agingBucket = 'OVERDUE_31_60';
        else agingBucket = 'CRITICAL_60_PLUS';
      }

      return {
        _id: party._id,
        name: party.name,
        contactName: party.contactName,
        phone: party.phone,
        email: party.email,
        gstin: party.gstin,
        state: party.state,
        billingAddress: party.billingAddress || party.address,
        paymentTerms: creditTerms,
        creditLimit: party.creditLimit || 0,
        bankDetails: party.bankDetails || null,
        totalAmount:  abStats.totalBilledAll || 0,
        totalSettled: pStats.totalPaid       || 0,
        outstanding,
        status,
        daysOverdue,
        agingBucket,
        lastTxnDate,
        openBills: myOpenBills,
        openBillsCount: myOpenBills.length,
      };
    });

    const finalResult = (req.query.activeOnly === 'true' || req.query.activeOnly === '1')
      ? result.filter(p => p.outstanding > 0)
      : result;

    res.json({ data: finalResult, message: 'OK', errors: null });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/payments/statement/:partyType/:partyId (Khata Bahi) ──
async function getPartyStatement(req, res, next) {
  try {
    const { partyType, partyId } = req.params;
    const { from, to } = req.query;

    if (!['CUSTOMER', 'SUPPLIER'].includes(partyType)) {
      return res.status(400).json({ data: null, message: 'partyType must be CUSTOMER or SUPPLIER', errors: null });
    }

    const Model = partyType === 'CUSTOMER' ? Customer : Supplier;
    const [party, tenant] = await Promise.all([
      Model.findOne({ _id: partyId, tenantId: req.tenantId }).lean(),
      Tenant.findById(req.tenantId).lean(),
    ]);

    if (!party) {
      return res.status(404).json({ data: null, message: `${partyType} not found`, errors: null });
    }

    const match = { tenantId: req.tenantId, partyId: new mongoose.Types.ObjectId(partyId) };
    if (from || to) {
      match.paymentDate = {};
      if (from) match.paymentDate.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        match.paymentDate.$lte = toDate;
      }
    }

    const transactions = await PaymentTransaction.find(match)
      .sort({ paymentDate: 1, createdAt: 1 })
      .lean();

    // Compute running balance
    let runningBalance = 0;
    const ledger = transactions.map(txn => {
      let debit = 0;
      let credit = 0;

      if (partyType === 'CUSTOMER') {
        // Invoices / Opening Bal increase customer debt (Debit)
        if (['INVOICE', 'OPENING_BAL'].includes(txn.txnType)) {
          debit = txn.amount;
          runningBalance += debit;
        } else if (txn.txnType === 'PAYMENT_IN') {
          credit = txn.amount;
          runningBalance -= credit;
        }
      } else {
        // Bills increase company debt to supplier (Credit)
        if (['BILL', 'OPENING_BAL'].includes(txn.txnType)) {
          credit = txn.amount;
          runningBalance += credit;
        } else if (txn.txnType === 'PAYMENT_OUT') {
          debit = txn.amount;
          runningBalance -= debit;
        }
      }

      return {
        _id: txn._id,
        voucherNo: txn.voucherNo,
        date: txn.paymentDate,
        dueDate: txn.dueDate,
        txnType: txn.txnType,
        paymentMode: txn.paymentMode,
        referenceNo: txn.referenceNo,
        notes: txn.notes,
        allocatedBills: txn.allocatedBills || [],
        settledAmount: txn.settledAmount || 0,
        paymentStatus: txn.paymentStatus || 'UNPAID',
        debit,
        credit,
        runningBalance: Math.abs(runningBalance),
        balanceType: runningBalance >= 0 ? (partyType === 'CUSTOMER' ? 'Dr' : 'Cr') : (partyType === 'CUSTOMER' ? 'Cr' : 'Dr'),
      };
    });

    const totalDebit  = ledger.reduce((sum, item) => sum + item.debit, 0);
    const totalCredit = ledger.reduce((sum, item) => sum + item.credit, 0);
    const netOutstanding = partyType === 'CUSTOMER' ? Math.max(0, totalDebit - totalCredit) : Math.max(0, totalCredit - totalDebit);

    res.json({
      data: {
        company: tenant ? {
          name: tenant.name,
          gstin: tenant.gst || '—',
          phone: tenant.phone || '—',
          email: tenant.email || '—',
          address: tenant.address || '—',
        } : null,
        party: {
          _id: party._id,
          name: party.name,
          contactName: party.contactName,
          phone: party.phone,
          email: party.email,
          gstin: party.gstin,
          billingAddress: party.billingAddress || party.address,
          paymentTerms: party.paymentTerms,
        },
        statement: ledger,
        summary: {
          totalDebit,
          totalCredit,
          netOutstanding,
          balanceType: runningBalance >= 0 ? (partyType === 'CUSTOMER' ? 'Dr (Receivable)' : 'Cr (Payable)') : (partyType === 'CUSTOMER' ? 'Cr (Advance)' : 'Dr (Advance)'),
          totalEntries: ledger.length,
        },
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/payments (List Payment Vouchers & Invoices) ────────────
async function listPayments(req, res, next) {
  try {
    const { txnType, partyType, paymentMode, search, from, to, page = 1, limit = 100 } = req.query;
    const rawTenant = req.query.tenantId || req.headers['x-tenant-id'];
    const targetTenantId = (rawTenant && req.isSuperAdmin)
      ? new mongoose.Types.ObjectId(rawTenant)
      : (req.tenantId ? new mongoose.Types.ObjectId(req.tenantId) : null);

    const filter = targetTenantId ? { tenantId: targetTenantId } : {};

    if (txnType) {
      if (txnType === 'OUTSIDE' || txnType === 'OUTSIDE_CASHFLOW') {
        filter.txnType = { $in: ['OUTSIDE_INFLOW', 'OUTSIDE_OUTFLOW'] };
      } else {
        filter.txnType = txnType;
      }
    }
    if (partyType) filter.partyType = partyType;
    if (paymentMode) filter.paymentMode = paymentMode;
    if (search) {
      filter.$or = [
        { voucherNo: { $regex: search, $options: 'i' } },
        { referenceNo: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { partyName: { $regex: search, $options: 'i' } },
      ];
    }
    if (from || to) {
      filter.paymentDate = {};
      if (from) filter.paymentDate.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.paymentDate.$lte = toDate;
      }
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [payments, total, typeCountsAgg] = await Promise.all([
      PaymentTransaction.find(filter)
        .populate('partyId', 'name phone gstin contactName')
        .sort({ paymentDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      PaymentTransaction.countDocuments(filter),
      PaymentTransaction.aggregate([
        { $match: targetTenantId ? { tenantId: targetTenantId } : {} },
        { $group: { _id: '$txnType', count: { $sum: 1 } } },
      ]),
    ]);

    const countsMap = Object.fromEntries(typeCountsAgg.map(t => [t._id, t.count]));

    res.json({
      data: {
        payments,
        counts: {
          total: Object.values(countsMap).reduce((a, b) => a + b, 0),
          invoices: countsMap.INVOICE || 0,
          bills: countsMap.BILL || 0,
          receipts: countsMap.PAYMENT_IN || 0,
          payments: countsMap.PAYMENT_OUT || 0,
          opening: countsMap.OPENING_BAL || 0,
          outside: (countsMap.OUTSIDE_INFLOW || 0) + (countsMap.OUTSIDE_OUTFLOW || 0),
          outsideInflow: countsMap.OUTSIDE_INFLOW || 0,
          outsideOutflow: countsMap.OUTSIDE_OUTFLOW || 0,
        },
        pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/payments/voucher/:voucherNoOrId (Get Single Invoice / Voucher Detail) ─
async function getVoucherDetail(req, res, next) {
  try {
    const { voucherNoOrId } = req.params;
    const isObjectId = mongoose.Types.ObjectId.isValid(voucherNoOrId);

    const query = {
      tenantId: req.tenantId,
      ...(isObjectId ? { $or: [{ _id: voucherNoOrId }, { voucherNo: voucherNoOrId }] } : { voucherNo: voucherNoOrId }),
    };

    const txn = await PaymentTransaction.findOne(query)
      .populate({
        path: 'stockLedgerId',
        populate: [
          { path: 'productId', select: 'name sku unit purchasePrice sellingPrice mrp gstRate hsnCode barcode' },
          { path: 'warehouseId', select: 'name code location address' },
        ],
      })
      .populate('createdBy', 'name email role')
      .lean();

    if (!txn) {
      return res.status(404).json({ data: null, message: 'Voucher or Invoice not found', errors: null });
    }

    // Populate party
    const Model = txn.partyType === 'CUSTOMER' ? Customer : (txn.partyType === 'SUPPLIER' ? Supplier : null);
    const [party, tenant] = await Promise.all([
      (Model && txn.partyId) ? Model.findOne({ _id: txn.partyId, tenantId: req.tenantId }).lean() : null,
      Tenant.findById(req.tenantId).lean(),
    ]);

    // Find linked settlement payments if this is an INVOICE or BILL
    let settlements = [];
    if (['INVOICE', 'BILL'].includes(txn.txnType)) {
      const payments = await PaymentTransaction.find({
        tenantId: req.tenantId,
        txnType: txn.txnType === 'INVOICE' ? 'PAYMENT_IN' : 'PAYMENT_OUT',
        $or: [
          { 'allocatedBills.billId': txn._id },
          { 'allocatedBills.voucherNo': txn.voucherNo },
        ],
      })
        .sort({ paymentDate: 1 })
        .lean();

      settlements = payments.map(p => {
        const alloc = (p.allocatedBills || []).find(
          b => String(b.billId) === String(txn._id) || b.voucherNo === txn.voucherNo
        );
        return {
          _id: p._id,
          voucherNo: p.voucherNo,
          date: p.paymentDate,
          paymentMode: p.paymentMode,
          referenceNo: p.referenceNo,
          notes: p.notes,
          allocatedAmount: alloc?.allocatedAmount || p.amount,
          remainingBillBalance: alloc?.remainingBillBalance ?? Math.max(0, txn.amount - (txn.settledAmount || 0)),
        };
      });
    }

    res.json({
      data: {
        txn,
        party: party || { _id: txn.partyId, name: txn.partyName || (txn.isOutsideCashflow ? 'Outside Entity' : 'Unknown Party') },
        company: tenant ? {
          name: tenant.name,
          gstin: tenant.gst || '—',
          phone: tenant.phone || '—',
          email: tenant.email || '—',
          address: tenant.address || '—',
        } : null,
        settlements,
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  recordPayment,
  recordOutsideCashflow,
  updateInitialWorkingCapital,
  getPendingBills,
  getDailySummary,
  getPaymentKpis,
  getOutstandings,
  getPartyStatement,
  listPayments,
  getVoucherDetail,
  getAccessibleCompanies,
};

