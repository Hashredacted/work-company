'use strict';

const mongoose = require('mongoose');
const BankAccount = require('../../models/inv/BankAccount');
const PaymentTransaction = require('../../models/inv/PaymentTransaction');
const Customer = require('../../models/inv/Customer');
const Supplier = require('../../models/inv/Supplier');
const Tenant = require('../../models/Tenant');
const AuditLog = require('../../models/AuditLog');
const { nextSeq } = require('../../utils/sequence');
const { blindIndex, decrypt, mask } = require('../../utils/encryption');
const { getTenantId } = require('../../utils/tenant');
const { generateAutoReference } = require('../../utils/reference');

// ─── GET /api/inventory/finance/bank-accounts ──────────────────────────────────
async function getBankAccounts(req, res, next) {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ data: null, message: 'Tenant ID required', errors: null });
    }

    const accounts = await BankAccount.find({ tenantId, deletedAt: null })
      .sort({ isDefault: -1, createdAt: 1 })
      .lean();

    // Compute live balance for each bank account
    const accountIds = accounts.map(a => a._id);

    // Aggregate inflows and outflows per bank account
    const txnsAgg = await PaymentTransaction.aggregate([
      {
        $match: {
          tenantId,
          $or: [
            { bankAccountId: { $in: accountIds } },
            { toBankAccountId: { $in: accountIds } },
          ],
        },
      },
      {
        $group: {
          _id: {
            bankAccountId: '$bankAccountId',
            toBankAccountId: '$toBankAccountId',
            txnType: '$txnType',
            paymentMode: '$paymentMode',
            cashflowCategory: '$cashflowCategory',
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const accountsWithBalance = accounts.map(acc => {
      const accIdStr = acc._id.toString();
      let totalInflows = 0;
      let totalOutflows = 0;
      let txnCount = 0;

      txnsAgg.forEach(item => {
        const srcAccId = item._id.bankAccountId?.toString();
        const tgtAccId = item._id.toBankAccountId?.toString();
        const type = item._id.txnType;
        const cat = item._id.cashflowCategory;
        const amt = item.total;

        // Inflow into this account:
        // 1. PAYMENT_IN / OUTSIDE_INFLOW assigned to this bank account
        // 2. CONTRA where this account is target (toBankAccountId or CASH_DEPOSIT_BANK to this account)
        if (tgtAccId === accIdStr || (srcAccId === accIdStr && (type === 'PAYMENT_IN' || type === 'OUTSIDE_INFLOW' || cat === 'CASH_DEPOSIT_BANK' || cat === 'DIRECT_BANK_RECEIPT'))) {
          // If it's a CONTRA inter-bank and we are tgtAccId -> Inflow
          if (type === 'CONTRA' && tgtAccId === accIdStr) {
            totalInflows += amt;
            txnCount += item.count;
          } else if (type !== 'CONTRA' || cat === 'CASH_DEPOSIT_BANK' || cat === 'DIRECT_BANK_RECEIPT') {
            if (type === 'PAYMENT_IN' || type === 'OUTSIDE_INFLOW' || cat === 'CASH_DEPOSIT_BANK' || cat === 'DIRECT_BANK_RECEIPT') {
              totalInflows += amt;
              txnCount += item.count;
            }
          }
        }

        // Outflow from this account:
        // 1. PAYMENT_OUT / OUTSIDE_OUTFLOW from this bank account
        // 2. CONTRA where this account is source (CASH_WITHDRAWAL_BANK or INTER_BANK_TRANSFER to another account)
        if (srcAccId === accIdStr) {
          if (type === 'PAYMENT_OUT' || type === 'OUTSIDE_OUTFLOW' || cat === 'CASH_WITHDRAWAL_BANK' || cat === 'DIRECT_BANK_PAYMENT' || (type === 'CONTRA' && cat === 'INTER_BANK_TRANSFER' && tgtAccId !== accIdStr)) {
            totalOutflows += amt;
            txnCount += item.count;
          }
        }
      });

      const opening = Number(acc.openingBalance || 0);
      const currentBalance = opening + totalInflows - totalOutflows;

      const plainAccNo = decrypt(acc.accountNumber || '');
      const plainUpi = acc.upiId ? decrypt(acc.upiId) : '';
      const maskedAcc = mask(plainAccNo, 4);

      return {
        ...acc,
        accountNumber: plainAccNo,
        accountNumberMasked: maskedAcc,
        upiId: plainUpi,
        openingBalance: opening,
        totalInflows,
        totalOutflows,
        currentBalance,
        transactionCount: txnCount,
      };
    });

    res.json({
      data: {
        accounts: accountsWithBalance,
        totalAccounts: accountsWithBalance.length,
        activeAccounts: accountsWithBalance.filter(a => a.isActive).length,
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── POST /api/inventory/finance/bank-accounts ─────────────────────────────────
async function createBankAccount(req, res, next) {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ data: null, message: 'Tenant ID required', errors: null });
    }

    const {
      bankName,
      accountName,
      accountNumber,
      ifscCode = '',
      branchName = '',
      accountType = 'CURRENT',
      upiId = '',
      openingBalance = 0,
      isDefault = false,
      notes = '',
    } = req.body;

    if (!bankName || !bankName.trim()) {
      return res.status(400).json({ data: null, message: 'Bank name is required', errors: null });
    }
    if (!accountName || !accountName.trim()) {
      return res.status(400).json({ data: null, message: 'Account name/title is required', errors: null });
    }
    if (!accountNumber || !accountNumber.trim()) {
      return res.status(400).json({ data: null, message: 'Account number is required', errors: null });
    }

    const trimmedAccNo = accountNumber.trim();
    const accHash = blindIndex(trimmedAccNo);

    // Check duplicate account number within this tenant (via blind index hash)
    const existing = await BankAccount.findOne({
      tenantId,
      $or: [
        { accountNumberHash: accHash },
        { accountNumber: trimmedAccNo },
      ],
      deletedAt: null,
    });

    if (existing) {
      return res.status(400).json({
        data: null,
        message: `A bank account with number "${trimmedAccNo}" already exists for your company.`,
        errors: null,
      });
    }

    // Count existing accounts to determine default status
    const existingCount = await BankAccount.countDocuments({ tenantId, deletedAt: null });
    let shouldBeDefault = Boolean(isDefault);
    if (existingCount === 0) {
      shouldBeDefault = true; // First account is default by default
    }

    if (shouldBeDefault) {
      await BankAccount.updateMany({ tenantId }, { $set: { isDefault: false } });
    }

    const numOpening = Math.max(0, Number(openingBalance) || 0);

    const bankAccount = await BankAccount.create({
      tenantId,
      bankName: bankName.trim(),
      accountName: accountName.trim(),
      accountNumber: trimmedAccNo,
      ifscCode: ifscCode.trim().toUpperCase(),
      branchName: branchName.trim(),
      accountType,
      upiId: upiId.trim().toLowerCase(),
      openingBalance: numOpening,
      isDefault: shouldBeDefault,
      isActive: true,
      notes: notes.trim(),
      createdBy: req.user?._id || req.userId,
    });

    // If opening balance > 0, create an OPENING_BAL transaction so it's transparent in money flow
    if (numOpening > 0) {
      const voucherNo = await nextSeq(tenantId, 'OB-BANK');
      await PaymentTransaction.create({
        tenantId,
        voucherNo,
        partyType: 'OTHER',
        partyName: 'Opening Balance (Initial Capital)',
        txnType: 'OUTSIDE_INFLOW',
        isOutsideCashflow: true,
        cashflowCategory: 'CAPITAL_INJECTION',
        amount: numOpening,
        paymentMode: 'NET_BANKING',
        paymentDate: new Date(),
        bankAccountId: bankAccount._id,
        sourceName: 'Initial Account Deposit',
        destinationName: `${bankAccount.bankName} (${trimmedAccNo.slice(-4)})`,
        notes: `Opening Balance for ${bankAccount.bankName} A/C - ${trimmedAccNo}`,
        createdBy: req.user?._id || req.userId,
      });
    }

    if (AuditLog) {
      await AuditLog.create({
        tenantId,
        userId: req.user?._id || req.userId,
        action: 'CREATE_BANK_ACCOUNT',
        resource: 'bank_accounts',
        resourceId: bankAccount._id.toString(),
        details: { bankName, accountName, accountNumber: trimmedAccNo, openingBalance: numOpening },
        ip: req.ip,
      });
    }

    res.status(201).json({
      data: bankAccount,
      message: `Bank account "${bankName} (${trimmedAccNo})" created successfully.`,
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/finance/bank-accounts/:id ──────────────────────────────
async function getBankAccountById(req, res, next) {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ data: null, message: 'Invalid Bank Account ID', errors: null });
    }

    const account = await BankAccount.findOne({ _id: id, tenantId, deletedAt: null }).lean();
    if (!account) {
      return res.status(404).json({ data: null, message: 'Bank account not found', errors: null });
    }

    const plainAcc = decrypt(account.accountNumber || '');
    account.accountNumber = plainAcc;
    account.accountNumberMasked = mask(plainAcc, 4);
    if (account.upiId) account.upiId = decrypt(account.upiId);

    // Get recent transactions for this account
    const recentTxns = await PaymentTransaction.find({
      tenantId,
      $or: [{ bankAccountId: account._id }, { toBankAccountId: account._id }],
    })
      .sort({ paymentDate: -1, createdAt: -1 })
      .limit(20)
      .lean();

    res.json({
      data: {
        account,
        recentTransactions: recentTxns,
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── PUT /api/inventory/finance/bank-accounts/:id ──────────────────────────────
async function updateBankAccount(req, res, next) {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ data: null, message: 'Invalid Bank Account ID', errors: null });
    }

    const account = await BankAccount.findOne({ _id: id, tenantId, deletedAt: null });
    if (!account) {
      return res.status(404).json({ data: null, message: 'Bank account not found', errors: null });
    }

    const {
      bankName,
      accountName,
      accountNumber,
      ifscCode,
      branchName,
      accountType,
      upiId,
      isDefault,
      isActive,
      notes,
    } = req.body;

    if (accountNumber && accountNumber.trim() !== account.accountNumber) {
      const trimmedNewNo = accountNumber.trim();
      const newHash = blindIndex(trimmedNewNo);
      const dup = await BankAccount.findOne({
        tenantId,
        $or: [
          { accountNumberHash: newHash },
          { accountNumber: trimmedNewNo },
        ],
        _id: { $ne: account._id },
        deletedAt: null,
      });
      if (dup) {
        return res.status(400).json({
          data: null,
          message: `Another bank account already uses number "${trimmedNewNo}".`,
          errors: null,
        });
      }
      account.accountNumber = trimmedNewNo;
    }

    if (bankName) account.bankName = bankName.trim();
    if (accountName) account.accountName = accountName.trim();
    if (ifscCode !== undefined) account.ifscCode = ifscCode.trim().toUpperCase();
    if (branchName !== undefined) account.branchName = branchName.trim();
    if (accountType) account.accountType = accountType;
    if (upiId !== undefined) account.upiId = upiId.trim().toLowerCase();
    if (notes !== undefined) account.notes = notes.trim();
    if (typeof isActive === 'boolean') account.isActive = isActive;

    if (isDefault) {
      await BankAccount.updateMany({ tenantId, _id: { $ne: account._id } }, { $set: { isDefault: false } });
      account.isDefault = true;
    }

    await account.save();

    if (AuditLog) {
      await AuditLog.create({
        tenantId,
        userId: req.user?._id || req.userId,
        action: 'UPDATE_BANK_ACCOUNT',
        resource: 'bank_accounts',
        resourceId: account._id.toString(),
        details: { bankName: account.bankName, accountName: account.accountName },
        ip: req.ip,
      });
    }

    res.json({
      data: account,
      message: 'Bank account updated successfully',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── DELETE /api/inventory/finance/bank-accounts/:id ───────────────────────────
async function deleteBankAccount(req, res, next) {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ data: null, message: 'Invalid Bank Account ID', errors: null });
    }

    const account = await BankAccount.findOne({ _id: id, tenantId, deletedAt: null });
    if (!account) {
      return res.status(404).json({ data: null, message: 'Bank account not found', errors: null });
    }

    // Check if there are transactions associated
    const txnCount = await PaymentTransaction.countDocuments({
      tenantId,
      $or: [{ bankAccountId: account._id }, { toBankAccountId: account._id }],
    });

    account.deletedAt = new Date();
    account.isActive = false;
    account.isDefault = false;
    await account.save();

    // If deleted account was default, assign another active account as default
    const anotherAcc = await BankAccount.findOne({ tenantId, deletedAt: null, isActive: true });
    if (anotherAcc) {
      anotherAcc.isDefault = true;
      await anotherAcc.save();
    }

    if (AuditLog) {
      await AuditLog.create({
        tenantId,
        userId: req.user?._id || req.userId,
        action: 'DELETE_BANK_ACCOUNT',
        resource: 'bank_accounts',
        resourceId: account._id.toString(),
        details: { bankName: account.bankName, txnCount },
        ip: req.ip,
      });
    }

    res.json({
      data: { _id: account._id, txnCount },
      message: `Bank account "${account.bankName} (${account.accountNumber})" has been deleted.`,
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── PUT /api/inventory/finance/bank-accounts/:id/set-default ──────────────────
async function setDefaultBankAccount(req, res, next) {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ data: null, message: 'Invalid Bank Account ID', errors: null });
    }

    const account = await BankAccount.findOne({ _id: id, tenantId, deletedAt: null, isActive: true });
    if (!account) {
      return res.status(404).json({ data: null, message: 'Active bank account not found', errors: null });
    }

    await BankAccount.updateMany({ tenantId }, { $set: { isDefault: false } });
    account.isDefault = true;
    await account.save();

    res.json({
      data: account,
      message: `"${account.bankName} (${account.accountNumber})" is now set as the primary default account.`,
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/finance/summary (Cash, Multi-Bank, & Flow KPIs) ────────
async function getFinancialSummary(req, res, next) {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ data: null, message: 'Tenant ID required', errors: null });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [accounts, txnsAgg, todayAgg] = await Promise.all([
      BankAccount.find({ tenantId, deletedAt: null }).lean(),
      PaymentTransaction.aggregate([
        {
          $match: {
            tenantId,
            txnType: { $in: ['PAYMENT_IN', 'PAYMENT_OUT', 'OUTSIDE_INFLOW', 'OUTSIDE_OUTFLOW', 'CONTRA'] },
          },
        },
        {
          $group: {
            _id: {
              txnType: '$txnType',
              paymentMode: '$paymentMode',
              cashflowCategory: '$cashflowCategory',
              bankAccountId: '$bankAccountId',
              toBankAccountId: '$toBankAccountId',
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
      PaymentTransaction.aggregate([
        {
          $match: {
            tenantId,
            paymentDate: { $gte: todayStart },
            txnType: { $in: ['PAYMENT_IN', 'PAYMENT_OUT', 'OUTSIDE_INFLOW', 'OUTSIDE_OUTFLOW', 'CONTRA'] },
          },
        },
        {
          $group: {
            _id: {
              txnType: '$txnType',
              paymentMode: '$paymentMode',
              cashflowCategory: '$cashflowCategory',
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // 1. Calculate Cash in Hand
    let cashIn = 0;
    let cashOut = 0;
    let cashInToday = 0;
    let cashOutToday = 0;

    txnsAgg.forEach(item => {
      const mode = item._id.paymentMode;
      const type = item._id.txnType;
      const cat = item._id.cashflowCategory;
      const isCash = mode === 'CASH';

      // Cash Inflows:
      if (isCash && (type === 'PAYMENT_IN' || type === 'OUTSIDE_INFLOW')) {
        cashIn += item.total;
      }
      if (cat === 'CASH_WITHDRAWAL_BANK') {
        cashIn += item.total; // Cash withdrawn from bank increases physical cash
      }

      // Cash Outflows:
      if (isCash && (type === 'PAYMENT_OUT' || type === 'OUTSIDE_OUTFLOW')) {
        cashOut += item.total;
      }
      if (cat === 'CASH_DEPOSIT_BANK') {
        cashOut += item.total; // Cash deposited into bank decreases physical cash
      }
    });

    todayAgg.forEach(item => {
      const mode = item._id.paymentMode;
      const type = item._id.txnType;
      const cat = item._id.cashflowCategory;
      const isCash = mode === 'CASH';

      if ((isCash && (type === 'PAYMENT_IN' || type === 'OUTSIDE_INFLOW')) || cat === 'CASH_WITHDRAWAL_BANK') {
        cashInToday += item.total;
      }
      if ((isCash && (type === 'PAYMENT_OUT' || type === 'OUTSIDE_OUTFLOW')) || cat === 'CASH_DEPOSIT_BANK') {
        cashOutToday += item.total;
      }
    });

    const cashBalance = cashIn - cashOut;
    const cashNetToday = cashInToday - cashOutToday;

    // 2. Calculate Per-Bank Balances & Bank Total
    let totalBankBalance = 0;
    let totalBankInflows = 0;
    let totalBankOutflows = 0;

    const bankCards = accounts.map(acc => {
      const accIdStr = acc._id.toString();
      let bIn = 0;
      let bOut = 0;

      txnsAgg.forEach(item => {
        const srcId = item._id.bankAccountId?.toString();
        const tgtId = item._id.toBankAccountId?.toString();
        const type = item._id.txnType;
        const cat = item._id.cashflowCategory;
        const amt = item.total;

        if (tgtId === accIdStr || (srcId === accIdStr && (type === 'PAYMENT_IN' || type === 'OUTSIDE_INFLOW' || cat === 'CASH_DEPOSIT_BANK' || cat === 'DIRECT_BANK_RECEIPT'))) {
          if (type === 'CONTRA' && tgtId === accIdStr) {
            bIn += amt;
          } else if (type !== 'CONTRA' || cat === 'CASH_DEPOSIT_BANK' || cat === 'DIRECT_BANK_RECEIPT') {
            bIn += amt;
          }
        }

        if (srcId === accIdStr) {
          if (type === 'PAYMENT_OUT' || type === 'OUTSIDE_OUTFLOW' || cat === 'CASH_WITHDRAWAL_BANK' || cat === 'DIRECT_BANK_PAYMENT' || (type === 'CONTRA' && cat === 'INTER_BANK_TRANSFER' && tgtId !== accIdStr)) {
            bOut += amt;
          }
        }
      });

      const opening = Number(acc.openingBalance || 0);
      const balance = opening + bIn - bOut;

      if (acc.isActive) {
        totalBankBalance += balance;
        totalBankInflows += bIn;
        totalBankOutflows += bOut;
      }

      return {
        _id: acc._id,
        bankName: acc.bankName,
        accountName: acc.accountName,
        accountNumber: acc.accountNumber,
        ifscCode: acc.ifscCode,
        branchName: acc.branchName,
        accountType: acc.accountType,
        upiId: acc.upiId,
        isDefault: acc.isDefault,
        isActive: acc.isActive,
        openingBalance: opening,
        inflows: bIn,
        outflows: bOut,
        balance,
      };
    });

    const totalLiquidAssets = cashBalance + totalBankBalance;
    const totalOverallInflow = cashIn + totalBankInflows;
    const totalOverallOutflow = cashOut + totalBankOutflows;

    res.json({
      data: {
        liquidAssets: totalLiquidAssets,
        cash: {
          balance: cashBalance,
          totalInflow: cashIn,
          totalOutflow: cashOut,
          todayInflow: cashInToday,
          todayOutflow: cashOutToday,
          todayNet: cashNetToday,
        },
        bank: {
          totalBalance: totalBankBalance,
          totalInflows: totalBankInflows,
          totalOutflows: totalBankOutflows,
          accountCount: accounts.length,
          activeCount: accounts.filter(a => a.isActive).length,
          accounts: bankCards,
        },
        overall: {
          totalInflow: totalOverallInflow,
          totalOutflow: totalOverallOutflow,
          netCashflow: totalOverallInflow - totalOverallOutflow,
        },
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── GET /api/inventory/finance/flow (Unified Cash & Bank Money Flow Statement) ─
async function getMoneyFlow(req, res, next) {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ data: null, message: 'Tenant ID required', errors: null });
    }

    const {
      accountType = 'ALL', // 'ALL', 'CASH', 'BANK'
      bankAccountId,
      flowDirection = 'ALL', // 'ALL', 'INFLOW', 'OUTFLOW', 'CONTRA'
      partyType,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 100,
    } = req.query;

    const matchQuery = {
      tenantId,
      txnType: { $in: ['PAYMENT_IN', 'PAYMENT_OUT', 'OUTSIDE_INFLOW', 'OUTSIDE_OUTFLOW', 'CONTRA'] },
    };

    // Filter by Account Type
    if (accountType === 'CASH') {
      matchQuery.$or = [
        { paymentMode: 'CASH' },
        { cashflowCategory: { $in: ['CASH_DEPOSIT_BANK', 'CASH_WITHDRAWAL_BANK'] } },
      ];
    } else if (accountType === 'BANK') {
      if (bankAccountId && mongoose.Types.ObjectId.isValid(bankAccountId)) {
        const bId = new mongoose.Types.ObjectId(bankAccountId);
        matchQuery.$or = [{ bankAccountId: bId }, { toBankAccountId: bId }];
      } else {
        matchQuery.$or = [
          { paymentMode: { $in: ['UPI', 'NEFT_RTGS', 'CHEQUE', 'NET_BANKING', 'CARD', 'TRANSFER', 'ONLINE', 'BANK_TRANSFER'] } },
          { bankAccountId: { $ne: null } },
          { toBankAccountId: { $ne: null } },
        ];
      }
    }

    // Filter by Flow Direction
    if (flowDirection === 'INFLOW') {
      matchQuery.txnType = { $in: ['PAYMENT_IN', 'OUTSIDE_INFLOW'] };
    } else if (flowDirection === 'OUTFLOW') {
      matchQuery.txnType = { $in: ['PAYMENT_OUT', 'OUTSIDE_OUTFLOW'] };
    } else if (flowDirection === 'CONTRA') {
      matchQuery.txnType = 'CONTRA';
    }

    // Filter by Party Type
    if (partyType && partyType !== 'ALL') {
      matchQuery.partyType = partyType;
    }

    // Date Range
    if (startDate || endDate) {
      matchQuery.paymentDate = {};
      if (startDate) matchQuery.paymentDate.$gte = new Date(startDate);
      if (endDate) {
        const eDate = new Date(endDate);
        eDate.setHours(23, 59, 59, 999);
        matchQuery.paymentDate.$lte = eDate;
      }
    }

    // Search Query (Voucher #, Party Name, Ref #, Notes)
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      matchQuery.$and = [
        ...(matchQuery.$and || []),
        {
          $or: [
            { voucherNo: regex },
            { partyName: regex },
            { referenceNo: regex },
            { bankAccount: regex },
            { notes: regex },
            { sourceName: regex },
            { destinationName: regex },
          ],
        },
      ];
    }

    const numLimit = Math.min(200, Math.max(1, Number(limit)));
    const numPage = Math.max(1, Number(page));
    const skip = (numPage - 1) * numLimit;

    const [totalCount, transactions, bankAccountsList] = await Promise.all([
      PaymentTransaction.countDocuments(matchQuery),
      PaymentTransaction.find(matchQuery)
        .populate('partyId', 'name contactName phone gstin')
        .populate('bankAccountId', 'bankName accountName accountNumber ifscCode upiId')
        .populate('toBankAccountId', 'bankName accountName accountNumber ifscCode upiId')
        .sort({ paymentDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(numLimit)
        .lean(),
      BankAccount.find({ tenantId, deletedAt: null }).lean(),
    ]);

    const bankAccountMap = new Map(bankAccountsList.map(b => [b._id.toString(), b]));

    // Format Money Flow Records with explicit Who-Sent-Whom-What
    const formattedFlow = transactions.map(t => {
      const mode = t.paymentMode || 'CASH';
      const isCash = mode === 'CASH';
      const type = t.txnType;
      const cat = t.cashflowCategory;

      let direction = 'INFLOW'; // INFLOW (Credit), OUTFLOW (Debit), CONTRA (Transfer)
      let displaySource = t.sourceName || '';
      let displayDestination = t.destinationName || '';
      let accountLabel = '';

      const srcAccNo = t.bankAccountId?.accountNumber ? decrypt(t.bankAccountId.accountNumber) : '';
      const tgtAccNo = t.toBankAccountId?.accountNumber ? decrypt(t.toBankAccountId.accountNumber) : '';
      const srcBank = t.bankAccountId ? (t.bankAccountId.bankName ? `${t.bankAccountId.bankName} (****${srcAccNo.slice(-4)})` : '') : '';
      const tgtBank = t.toBankAccountId ? (t.toBankAccountId.bankName ? `${t.toBankAccountId.bankName} (****${tgtAccNo.slice(-4)})` : '') : '';

      if (type === 'CONTRA' || cat === 'CASH_DEPOSIT_BANK' || cat === 'CASH_WITHDRAWAL_BANK' || cat === 'INTER_BANK_TRANSFER') {
        direction = 'CONTRA';
        if (cat === 'CASH_DEPOSIT_BANK') {
          displaySource = '💵 Cash Register (In Hand)';
          displayDestination = `🏦 ${tgtBank || srcBank || 'Bank Account'}`;
          accountLabel = `Cash ➔ ${tgtBank || srcBank || 'Bank'}`;
        } else if (cat === 'CASH_WITHDRAWAL_BANK') {
          displaySource = `🏦 ${srcBank || 'Bank Account'}`;
          displayDestination = '💵 Cash Register (In Hand)';
          accountLabel = `${srcBank || 'Bank'} ➔ Cash`;
        } else if (cat === 'INTER_BANK_TRANSFER') {
          displaySource = `🏦 ${srcBank || 'Source Bank'}`;
          displayDestination = `🏦 ${tgtBank || 'Target Bank'}`;
          accountLabel = `${srcBank || 'Bank A'} ➔ ${tgtBank || 'Bank B'}`;
        }
      } else if (type === 'PAYMENT_IN' || type === 'OUTSIDE_INFLOW') {
        direction = 'INFLOW';
        const partyName = t.partyId?.name || t.partyName || (type === 'PAYMENT_IN' ? 'Customer' : 'Capital / Inflow');
        displaySource = partyName;
        displayDestination = isCash ? '💵 Cash Register' : `🏦 ${srcBank || t.bankAccount || 'Bank Account'}`;
        accountLabel = isCash ? 'Cash in Hand' : (srcBank || t.bankAccount || 'Bank A/C');
      } else if (type === 'PAYMENT_OUT' || type === 'OUTSIDE_OUTFLOW') {
        direction = 'OUTFLOW';
        const partyName = t.partyId?.name || t.partyName || (type === 'PAYMENT_OUT' ? 'Supplier' : 'Expense / Outflow');
        displaySource = isCash ? '💵 Cash Register' : `🏦 ${srcBank || t.bankAccount || 'Bank Account'}`;
        displayDestination = partyName;
        accountLabel = isCash ? 'Cash in Hand' : (srcBank || t.bankAccount || 'Bank A/C');
      }

      return {
        _id: t._id,
        voucherNo: t.voucherNo,
        date: t.paymentDate,
        txnType: type,
        category: cat,
        direction,
        amount: t.amount,
        paymentMode: mode,
        accountLabel,
        source: displaySource,
        destination: displayDestination,
        partyType: t.partyType,
        partyName: t.partyId?.name || t.partyName || '',
        referenceNo: t.referenceNo || '',
        bankAccountDetails: t.bankAccountId || null,
        targetBankDetails: t.toBankAccountId || null,
        notes: t.notes || '',
        createdAt: t.createdAt,
      };
    });

    res.json({
      data: {
        flows: formattedFlow,
        pagination: {
          total: totalCount,
          page: numPage,
          limit: numLimit,
          totalPages: Math.ceil(totalCount / numLimit),
        },
      },
      message: 'OK',
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── POST /api/inventory/finance/transfer (Contra Transfer: Cash <-> Bank, Bank <-> Bank) ─
async function recordTransfer(req, res, next) {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ data: null, message: 'Tenant ID required', errors: null });
    }

    const {
      fromType, // 'CASH' or 'BANK'
      fromBankAccountId,
      toType, // 'CASH' or 'BANK'
      toBankAccountId,
      amount,
      transferDate,
      referenceNo = '',
      notes = '',
    } = req.body;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ data: null, message: 'Transfer amount must be greater than 0', errors: null });
    }

    if (!['CASH', 'BANK'].includes(fromType) || !['CASH', 'BANK'].includes(toType)) {
      return res.status(400).json({ data: null, message: 'Invalid source or destination type', errors: null });
    }

    if (fromType === 'CASH' && toType === 'CASH') {
      return res.status(400).json({ data: null, message: 'Source and destination cannot both be Cash', errors: null });
    }

    if (fromType === 'BANK' && toType === 'BANK' && fromBankAccountId === toBankAccountId) {
      return res.status(400).json({ data: null, message: 'Source and destination bank account cannot be the same', errors: null });
    }

    let srcBank = null;
    let tgtBank = null;
    let category = 'INTER_BANK_TRANSFER';
    let mode = 'TRANSFER';
    let voucherPrefix = 'TXF';

    if (fromType === 'CASH' && toType === 'BANK') {
      if (!toBankAccountId) {
        return res.status(400).json({ data: null, message: 'Target bank account is required for cash deposit', errors: null });
      }
      tgtBank = await BankAccount.findOne({ _id: toBankAccountId, tenantId, deletedAt: null });
      if (!tgtBank) return res.status(404).json({ data: null, message: 'Target bank account not found', errors: null });

      category = 'CASH_DEPOSIT_BANK';
      mode = 'CASH';
      voucherPrefix = 'DEP';
    } else if (fromType === 'BANK' && toType === 'CASH') {
      if (!fromBankAccountId) {
        return res.status(400).json({ data: null, message: 'Source bank account is required for cash withdrawal', errors: null });
      }
      srcBank = await BankAccount.findOne({ _id: fromBankAccountId, tenantId, deletedAt: null });
      if (!srcBank) return res.status(404).json({ data: null, message: 'Source bank account not found', errors: null });

      category = 'CASH_WITHDRAWAL_BANK';
      mode = 'CHEQUE';
      voucherPrefix = 'WTH';
    } else if (fromType === 'BANK' && toType === 'BANK') {
      if (!fromBankAccountId || !toBankAccountId) {
        return res.status(400).json({ data: null, message: 'Both source and target bank accounts are required', errors: null });
      }
      [srcBank, tgtBank] = await Promise.all([
        BankAccount.findOne({ _id: fromBankAccountId, tenantId, deletedAt: null }),
        BankAccount.findOne({ _id: toBankAccountId, tenantId, deletedAt: null }),
      ]);
      if (!srcBank) return res.status(404).json({ data: null, message: 'Source bank account not found', errors: null });
      if (!tgtBank) return res.status(404).json({ data: null, message: 'Target bank account not found', errors: null });

      category = 'INTER_BANK_TRANSFER';
      mode = 'NET_BANKING';
      voucherPrefix = 'TXF';
    }

    const voucherNo = await nextSeq(tenantId, voucherPrefix);
    const dateToUse = transferDate ? new Date(transferDate) : new Date();

    const srcAccPlain = srcBank ? decrypt(srcBank.accountNumber) : '';
    const tgtAccPlain = tgtBank ? decrypt(tgtBank.accountNumber) : '';
    const srcName = fromType === 'CASH' ? 'Cash in Hand (Drawer)' : `${srcBank.bankName} (****${srcAccPlain.slice(-4)})`;
    const tgtName = toType === 'CASH' ? 'Cash in Hand (Drawer)' : `${tgtBank.bankName} (****${tgtAccPlain.slice(-4)})`;
    const finalRef = referenceNo.trim() || generateAutoReference(mode, category);

    const txn = await PaymentTransaction.create({
      tenantId,
      voucherNo,
      partyType: 'INTERNAL',
      partyName: `Contra: ${srcName} ➔ ${tgtName}`,
      txnType: 'CONTRA',
      isOutsideCashflow: true,
      cashflowCategory: category,
      amount: numAmount,
      paymentMode: mode,
      paymentDate: dateToUse,
      referenceNo: finalRef,
      bankAccountId: srcBank?._id || null,
      toBankAccountId: tgtBank?._id || null,
      sourceName: srcName,
      destinationName: tgtName,
      transferType: category,
      notes: notes.trim() || `Fund transfer of ₹${numAmount.toLocaleString('en-IN')} from ${srcName} to ${tgtName}`,
      createdBy: req.user?._id || req.userId,
    });

    if (AuditLog) {
      await AuditLog.create({
        tenantId,
        userId: req.user?._id || req.userId,
        action: 'CONTRA_FUND_TRANSFER',
        resource: 'finance',
        resourceId: txn._id.toString(),
        details: { voucherNo, category, amount: numAmount, from: srcName, to: tgtName, referenceNo },
        ip: req.ip,
      });
    }

    res.status(201).json({
      data: txn,
      message: `Transferred ₹${numAmount.toLocaleString('en-IN')} from ${srcName} to ${tgtName} successfully (Voucher: ${voucherNo}).`,
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

// ─── POST /api/inventory/finance/quick-entry (Direct Inflow/Outflow Entry) ─────
async function recordQuickFinanceEntry(req, res, next) {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ data: null, message: 'Tenant ID required', errors: null });
    }

    const {
      direction, // 'INFLOW' or 'OUTFLOW'
      accountType, // 'CASH' or 'BANK'
      bankAccountId,
      amount,
      category = 'OTHER_INFLOW',
      partyName = '',
      paymentMode = 'CASH',
      referenceNo = '',
      paymentDate,
      notes = '',
    } = req.body;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ data: null, message: 'Amount must be greater than 0', errors: null });
    }

    const isAdd = direction === 'INFLOW' || direction === 'ADD' || direction === '+';
    const txnType = isAdd ? 'OUTSIDE_INFLOW' : 'OUTSIDE_OUTFLOW';
    const prefix = isAdd ? 'FIN-IN' : 'FIN-OUT';

    let bankAccount = null;
    let validMode = paymentMode;

    if (accountType === 'BANK') {
      if (bankAccountId && mongoose.Types.ObjectId.isValid(bankAccountId)) {
        bankAccount = await BankAccount.findOne({ _id: bankAccountId, tenantId, deletedAt: null });
      }
      if (!bankAccount) {
        bankAccount = await BankAccount.findOne({ tenantId, deletedAt: null, isActive: true, isDefault: true }) || await BankAccount.findOne({ tenantId, deletedAt: null, isActive: true });
      }
      if (!bankAccount) {
        const randAcc = '5010' + Math.floor(10000000 + Math.random() * 90000000);
        bankAccount = await BankAccount.create({
          tenantId,
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
      if (validMode === 'CASH') validMode = 'UPI';
    } else {
      validMode = 'CASH';
    }

    const voucherNo = await nextSeq(tenantId, prefix);
    const dateToUse = paymentDate ? new Date(paymentDate) : new Date();

    const targetAccountName = accountType === 'BANK' ? `${bankAccount.bankName} (****${(decrypt(bankAccount.accountNumber) || '').slice(-4)})` : 'Cash Register';
    const src = isAdd ? (partyName.trim() || 'Outside Capital / Inflow') : targetAccountName;
    const dst = isAdd ? targetAccountName : (partyName.trim() || 'Expense / Payee');

    const txn = await PaymentTransaction.create({
      tenantId,
      voucherNo,
      partyType: 'OTHER',
      partyName: partyName.trim() || (isAdd ? 'External Capital / Income' : 'Expense / Operating Payout'),
      txnType,
      isOutsideCashflow: true,
      cashflowCategory: category,
      amount: numAmount,
      paymentMode: validMode,
      paymentDate: dateToUse,
      referenceNo: referenceNo.trim() || generateAutoReference(validMode, category),
      bankAccountId: bankAccount?._id || null,
      sourceName: src,
      destinationName: dst,
      transferType: isAdd ? 'OUTSIDE_INFLOW' : 'OUTSIDE_OUTFLOW',
      notes: notes.trim() || `${isAdd ? 'Direct Inflow' : 'Direct Outflow'} (${category}) to ${targetAccountName}`,
      createdBy: req.user?._id || req.userId,
    });

    if (AuditLog) {
      await AuditLog.create({
        tenantId,
        userId: req.user?._id || req.userId,
        action: txnType,
        resource: 'finance',
        resourceId: txn._id.toString(),
        details: { voucherNo, direction, accountType, amount: numAmount, partyName, category },
        ip: req.ip,
      });
    }

    res.status(201).json({
      data: txn,
      message: `Recorded ${isAdd ? 'Inflow' : 'Outflow'} of ₹${numAmount.toLocaleString('en-IN')} ${isAdd ? 'to' : 'from'} ${targetAccountName} successfully (Voucher: ${voucherNo}).`,
      errors: null,
    });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  getBankAccounts,
  createBankAccount,
  getBankAccountById,
  updateBankAccount,
  deleteBankAccount,
  setDefaultBankAccount,
  getFinancialSummary,
  getMoneyFlow,
  recordTransfer,
  recordQuickFinanceEntry,
};
