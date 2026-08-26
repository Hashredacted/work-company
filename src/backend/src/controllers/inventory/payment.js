'use strict';

const mongoose          = require('mongoose');
const PaymentTransaction = require('../../models/inv/PaymentTransaction');
const Customer          = require('../../models/inv/Customer');
const Supplier          = require('../../models/inv/Supplier');
const Tenant            = require('../../models/Tenant');
const AuditLog          = require('../../models/AuditLog');
const { nextSeq }       = require('../../utils/sequence');

// ─── POST /api/inventory/payments (Record Standalone Payment In / Out) ───────
async function recordPayment(req, res, next) {
  try {
    const { partyType, partyId, amount, paymentMode, paymentDate, referenceNo, bankAccount, notes } = req.body;

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

    const txn = await PaymentTransaction.create({
      tenantId: req.tenantId,
      voucherNo,
      partyType,
      partyId: party._id,
      partyModel,
      txnType,
      amount: numAmount,
      paymentMode: paymentMode || 'UPI',
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      referenceNo: referenceNo || null,
      bankAccount: bankAccount || null,
      notes: notes || (partyType === 'CUSTOMER' ? 'Payment received from customer' : 'Payment made to supplier'),
      createdBy: req.user._id,
    });

    // Compute updated balance for this party
    const balanceAgg = await PaymentTransaction.aggregate([
      { $match: { tenantId: req.tenantId, partyId: party._id } },
      {
        $group: {
          _id: null,
          totalDebit: {
            $sum: {
              $cond: [{ $in: ['$txnType', partyType === 'CUSTOMER' ? ['INVOICE', 'OPENING_BAL'] : ['PAYMENT_OUT']] }, '$amount', 0],
            },
          },
          totalCredit: {
            $sum: {
              $cond: [{ $in: ['$txnType', partyType === 'CUSTOMER' ? ['PAYMENT_IN'] : ['BILL', 'OPENING_BAL']] }, '$amount', 0],
            },
          },
        },
      },
    ]);

    const updatedOutstanding = partyType === 'CUSTOMER'
      ? (balanceAgg[0]?.totalDebit || 0) - (balanceAgg[0]?.totalCredit || 0)
      : (balanceAgg[0]?.totalCredit || 0) - (balanceAgg[0]?.totalDebit || 0);

    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: txnType,
      resource: 'payments',
      resourceId: txn._id.toString(),
      details: { voucherNo, partyName: party.name, amount: numAmount, paymentMode, referenceNo, updatedOutstanding },
      ip: req.ip,
    });

    res.status(201).json({
      data: { txn, partyOutstanding: Math.max(0, updatedOutstanding) },
      message: `Payment Voucher ${voucherNo} recorded successfully. Current Outstanding: ₹${Math.max(0, updatedOutstanding).toLocaleString('en-IN')}`,
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/payments/kpis (Overall Receivables & Payables) ────────
async function getPaymentKpis(req, res, next) {
  try {
    const agg = await PaymentTransaction.aggregate([
      { $match: { tenantId: req.tenantId } },
      {
        $group: {
          _id: '$partyType',
          totalInvoiced: { $sum: { $cond: [{ $eq: ['$txnType', 'INVOICE'] }, '$amount', 0] } },
          totalReceived: { $sum: { $cond: [{ $eq: ['$txnType', 'PAYMENT_IN'] }, '$amount', 0] } },
          totalBilled:   { $sum: { $cond: [{ $eq: ['$txnType', 'BILL'] }, '$amount', 0] } },
          totalPaid:     { $sum: { $cond: [{ $eq: ['$txnType', 'PAYMENT_OUT'] }, '$amount', 0] } },
        },
      },
    ]);

    const custStats = agg.find(a => a._id === 'CUSTOMER') || {};
    const suppStats = agg.find(a => a._id === 'SUPPLIER') || {};

    const totalReceivables = Math.max(0, (custStats.totalInvoiced || 0) - (custStats.totalReceived || 0));
    const totalPayables    = Math.max(0, (suppStats.totalBilled || 0) - (suppStats.totalPaid || 0));

    // Overdue calculations based on due dates
    const now = new Date();
    const overdueAgg = await PaymentTransaction.aggregate([
      {
        $match: {
          tenantId: req.tenantId,
          dueDate: { $ne: null, $lt: now },
          txnType: { $in: ['INVOICE', 'BILL'] },
        },
      },
      {
        $group: {
          _id: '$partyType',
          overdueAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const overdueReceivables = overdueAgg.find(a => a._id === 'CUSTOMER')?.overdueAmount || 0;
    const overduePayables    = overdueAgg.find(a => a._id === 'SUPPLIER')?.overdueAmount || 0;

    res.json({
      data: {
        totalReceivables,
        totalPayables,
        overdueReceivables: Math.min(totalReceivables, overdueReceivables),
        overduePayables: Math.min(totalPayables, overduePayables),
        netWorkingCapital: totalReceivables - totalPayables,
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/payments/outstandings (Party Outstandings List) ───────
async function getOutstandings(req, res, next) {
  try {
    const { type = 'CUSTOMER', search } = req.query;
    if (!['CUSTOMER', 'SUPPLIER'].includes(type)) {
      return res.status(400).json({ data: null, message: 'type must be CUSTOMER or SUPPLIER', errors: null });
    }

    const Model = type === 'CUSTOMER' ? Customer : Supplier;
    const filter = { tenantId: req.tenantId, deletedAt: null, isActive: { $ne: false } };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { gstin: { $regex: search, $options: 'i' } },
      ];
    }

    const parties = await Model.find(filter).sort({ name: 1 }).lean();
    const partyIds = parties.map(p => p._id);

    // Aggregate transactions per party
    const txns = await PaymentTransaction.aggregate([
      { $match: { tenantId: req.tenantId, partyId: { $in: partyIds } } },
      {
        $group: {
          _id: '$partyId',
          totalBilledOrInvoiced: {
            $sum: { $cond: [{ $in: ['$txnType', ['BILL', 'INVOICE', 'OPENING_BAL']] }, '$amount', 0] },
          },
          totalSettled: {
            $sum: { $cond: [{ $in: ['$txnType', ['PAYMENT_IN', 'PAYMENT_OUT']] }, '$amount', 0] },
          },
          lastTxnDate: { $max: '$paymentDate' },
        },
      },
    ]);

    const txnMap = Object.fromEntries(txns.map(t => [t._id.toString(), t]));
    const now = new Date();

    const result = parties.map(party => {
      const stats = txnMap[party._id.toString()] || { totalBilledOrInvoiced: 0, totalSettled: 0, lastTxnDate: null };
      const outstanding = Math.max(0, stats.totalBilledOrInvoiced - stats.totalSettled);
      const creditTerms = party.paymentTerms || (type === 'CUSTOMER' ? 15 : 30);
      
      let status = 'CLEARED';
      let daysOverdue = 0;

      if (outstanding > 0) {
        if (stats.lastTxnDate) {
          const daysElapsed = Math.floor((now - new Date(stats.lastTxnDate)) / 86400000);
          if (daysElapsed > creditTerms) {
            daysOverdue = daysElapsed - creditTerms;
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
        totalAmount: stats.totalBilledOrInvoiced,
        totalSettled: stats.totalSettled,
        outstanding,
        status,
        daysOverdue,
        lastTxnDate: stats.lastTxnDate,
      };
    });

    res.json({ data: result, message: 'OK', errors: null });
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
        txnType: txn.txnType,
        paymentMode: txn.paymentMode,
        referenceNo: txn.referenceNo,
        notes: txn.notes,
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

// ─── GET /api/inventory/payments (List Payment Vouchers) ─────────────────────
async function listPayments(req, res, next) {
  try {
    const { partyType, paymentMode, search, from, to, page = 1, limit = 50 } = req.query;
    const filter = { tenantId: req.tenantId };

    if (partyType) filter.partyType = partyType;
    if (paymentMode) filter.paymentMode = paymentMode;
    if (search) {
      filter.$or = [
        { voucherNo: { $regex: search, $options: 'i' } },
        { referenceNo: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
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
    const [payments, total] = await Promise.all([
      PaymentTransaction.find(filter)
        .populate('partyId', 'name phone gstin')
        .sort({ paymentDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      PaymentTransaction.countDocuments(filter),
    ]);

    res.json({
      data: {
        payments,
        pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
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
  getPaymentKpis,
  getOutstandings,
  getPartyStatement,
  listPayments,
};
