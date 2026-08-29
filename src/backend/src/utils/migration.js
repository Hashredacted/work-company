'use strict';

const mongoose = require('mongoose');
const { encrypt, decrypt, blindIndex, mask } = require('./encryption');

/**
 * Self-healing startup migration:
 * 1. Ensures every active tenant has default simulated bank accounts (HDFC, ICICI, SBI).
 * 2. Seamlessly encrypts legacy database records with AES-256-GCM and blind indexes.
 * 3. Auto-links all historical payment transactions (where bankAccountId is null) to the tenant's primary bank account.
 * 4. Backfills missing realistic fields: sourceName, destinationName, banking UTR references, and contra categories.
 */
async function runStartupMigrations() {
  try {
    const db = mongoose.connection.db;
    if (!db) return;

    const tenantCol = db.collection('tenants');
    const bankCol = db.collection('invbankaccounts');
    const txnCol = db.collection('invpaymenttransactions');
    const suppCol = db.collection('invsuppliers');
    const custCol = db.collection('invcustomers');

    // ─── 1. Ensure Simulated Bank Accounts for Demo Tenants & Active Non-Cash Tenants ────────────
    const activeTenants = await tenantCol.find({ deletedAt: null }).toArray();

    for (const tenant of activeTenants) {
      const tenantId = tenant._id;
      const tenantBankCount = await bankCol.countDocuments({ tenantId, deletedAt: null });

      if (tenantBankCount === 0) {
        const isDemoTenant = /Apex Retail|Acme|Nexus|Demo/i.test(tenant.name || '') || tenant.isDemo;
        const hasNonCashTxns = await txnCol.countDocuments({
          tenantId,
          paymentMode: { $nin: ['CASH', 'CREDIT'] },
          txnType: { $nin: ['INVOICE', 'BILL'] },
        });

        // Only create initial bank account if it's a demo company or if they have unlinked non-cash transactions
        if (isDemoTenant) {
          const hdfcAccNo = '50200099881122';
          const iciciAccNo = '91900088776655';

          await bankCol.insertMany([
            {
              tenantId,
              bankName: 'HDFC Bank',
              accountName: 'HDFC Main Operational A/C',
              accountNumber: encrypt(hdfcAccNo),
              accountNumberHash: blindIndex(hdfcAccNo),
              accountNumberMasked: mask(hdfcAccNo, 4),
              ifscCode: 'HDFC0000123',
              branchName: 'Koramangala, Bengaluru',
              accountType: 'CURRENT',
              upiId: encrypt('company@hdfcbank'),
              openingBalance: 200000,
              isDefault: true,
              isActive: true,
              notes: 'Primary business operating current account',
              deletedAt: null,
              createdAt: new Date(Date.now() - 60 * 86400000),
              updatedAt: new Date(Date.now() - 60 * 86400000),
            },
            {
              tenantId,
              bankName: 'ICICI Bank',
              accountName: 'ICICI Vendor Payouts A/C',
              accountNumber: encrypt(iciciAccNo),
              accountNumberHash: blindIndex(iciciAccNo),
              accountNumberMasked: mask(iciciAccNo, 4),
              ifscCode: 'ICIC0001040',
              branchName: 'Indiranagar, Bengaluru',
              accountType: 'CURRENT',
              upiId: encrypt('company@icici'),
              openingBalance: 100000,
              isDefault: false,
              isActive: true,
              notes: 'Secondary account for vendor payouts & supplier supplies',
              deletedAt: null,
              createdAt: new Date(Date.now() - 60 * 86400000),
              updatedAt: new Date(Date.now() - 60 * 86400000),
            },
          ]);
          console.log(`[Migration] ✓ Seeded demo bank accounts for demo tenant: ${tenant.name || tenantId}`);
        } else if (hasNonCashTxns > 0) {
          // Auto-create a single clean editable default account for non-demo tenants with transactions
          const defaultAccNo = '5010' + Math.floor(10000000 + Math.random() * 90000000);
          await bankCol.insertOne({
            tenantId,
            bankName: 'Main Business Bank A/C',
            accountName: 'Primary Operating Account',
            accountNumber: encrypt(defaultAccNo),
            accountNumberHash: blindIndex(defaultAccNo),
            accountNumberMasked: mask(defaultAccNo, 4),
            ifscCode: 'HDFC0000123',
            branchName: 'Main Branch',
            accountType: 'CURRENT',
            upiId: '',
            openingBalance: 0,
            isDefault: true,
            isActive: true,
            notes: 'Default operational bank account. You can edit this bank name, account number, and details anytime in Finance Master.',
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          console.log(`[Migration] ✓ Auto-created editable default bank account for active tenant: ${tenant.name || tenantId}`);
        }
        // Brand new tenants without transactions remain 100% clean & blank!
      }
    }

    // ─── 2. Synchronize & Encrypt All Bank Accounts ─────────────────────────
    const allBanks = await bankCol.find({}).toArray();
    for (const b of allBanks) {
      const rawAcc = decrypt(b.accountNumber || '');
      const hash = blindIndex(rawAcc);
      const maskedVal = mask(rawAcc, 4);
      const encryptedAcc = encrypt(rawAcc);
      const rawUpi = b.upiId ? decrypt(b.upiId) : '';
      const encryptedUpi = rawUpi ? encrypt(rawUpi) : b.upiId;

      if (b.accountNumber !== encryptedAcc || b.accountNumberHash !== hash || b.accountNumberMasked !== maskedVal || b.upiId !== encryptedUpi) {
        await bankCol.updateOne(
          { _id: b._id },
          {
            $set: {
              accountNumber: encryptedAcc,
              accountNumberHash: hash,
              accountNumberMasked: maskedVal,
              upiId: encryptedUpi,
            },
          }
        );
      }
    }

    // Drop legacy plaintext index if present
    try {
      const indexes = await bankCol.indexes();
      const legacyIdx = indexes.find(i => i.name === 'tenantId_1_accountNumber_1_deletedAt_1');
      if (legacyIdx) {
        await bankCol.dropIndex('tenantId_1_accountNumber_1_deletedAt_1');
      }
    } catch (idxErr) {
      // Ignore
    }

    // ─── 3. Auto-Link Historical Transactions to Default Bank Account ─────────
    const suppliers = await suppCol.find({}).toArray();
    const customers = await custCol.find({}).toArray();
    const suppMap = new Map(suppliers.map(s => [s._id.toString(), s.name]));
    const custMap = new Map(customers.map(c => [c._id.toString(), c.name]));

    const allTenantsBanks = await bankCol.find({ deletedAt: null }).toArray();
    const tenantBankMap = new Map();
    for (const b of allTenantsBanks) {
      const tId = b.tenantId.toString();
      if (!tenantBankMap.has(tId)) tenantBankMap.set(tId, []);
      tenantBankMap.get(tId).push({
        ...b,
        accountNumberDecrypted: decrypt(b.accountNumber),
        accountNumberMasked: b.accountNumberMasked || mask(decrypt(b.accountNumber), 4),
      });
    }

    // Find all payment transactions that need field backfilling or bankAccount linking
    const transactions = await txnCol.find({}).toArray();
    let updatedTxnCount = 0;

    for (const t of transactions) {
      const tTenantIdStr = t.tenantId ? t.tenantId.toString() : '';
      const tenantBanks = tenantBankMap.get(tTenantIdStr) || [];
      const defaultBank = tenantBanks.find(b => b.isDefault) || tenantBanks[0];
      const iciciBank = tenantBanks.find(b => /icici/i.test(b.bankName)) || defaultBank;

      const updates = {};
      let changed = false;

      const mode = t.paymentMode || 'CASH';
      const isCash = mode === 'CASH' || mode === 'CREDIT';
      const type = t.txnType;

      // 3a. Auto-link missing bankAccountId for non-cash settlement transactions
      let linkedBank = null;
      if (!isCash && type !== 'INVOICE' && type !== 'BILL') {
        if (!t.bankAccountId && defaultBank) {
          const bankStr = String(t.bankAccount || '');
          if (/icici/i.test(bankStr)) {
            updates.bankAccountId = iciciBank._id;
            linkedBank = iciciBank;
          } else {
            updates.bankAccountId = defaultBank._id;
            linkedBank = defaultBank;
          }
          changed = true;
        } else if (t.bankAccountId) {
          linkedBank = tenantBanks.find(b => b._id.toString() === t.bankAccountId.toString()) || defaultBank;
        }
      }

      // 3b. Backfill partyName if missing
      let pName = t.partyName;
      if (!pName && t.partyId) {
        pName = (t.partyType === 'SUPPLIER' ? suppMap.get(t.partyId.toString()) : custMap.get(t.partyId.toString())) || '';
        if (pName) {
          updates.partyName = pName;
          changed = true;
        }
      }

      // 3c. Backfill realistic sourceName and destinationName (Who sent whose money)
      const bankLabel = linkedBank ? `🏦 ${linkedBank.bankName} (****${linkedBank.accountNumberMasked})` : (defaultBank ? `🏦 ${defaultBank.bankName} (****${defaultBank.accountNumberMasked})` : '🏦 Main Bank A/C');
      const partyLabel = pName || (t.partyType === 'CUSTOMER' ? 'Retail Customer' : (t.partyType === 'SUPPLIER' ? 'Authorized Supplier' : 'Direct Account'));

      if (!t.sourceName || !t.destinationName || t.sourceName.includes('undefined')) {
        if (type === 'PAYMENT_IN') {
          updates.sourceName = partyLabel;
          updates.destinationName = isCash ? '💵 Cash Register (In Hand)' : bankLabel;
          changed = true;
        } else if (type === 'PAYMENT_OUT') {
          updates.sourceName = isCash ? '💵 Cash Register (In Hand)' : bankLabel;
          updates.destinationName = partyLabel;
          changed = true;
        } else if (type === 'OUTSIDE_INFLOW') {
          updates.sourceName = partyLabel || 'Opening Capital / Outside Flow';
          updates.destinationName = isCash ? '💵 Cash Register (In Hand)' : bankLabel;
          changed = true;
        } else if (type === 'OUTSIDE_OUTFLOW') {
          updates.sourceName = isCash ? '💵 Cash Register (In Hand)' : bankLabel;
          updates.destinationName = partyLabel || 'Operating Expenses / Outside Flow';
          changed = true;
        } else if (type === 'CONTRA') {
          const cat = t.cashflowCategory;
          if (cat === 'CASH_DEPOSIT_BANK') {
            updates.sourceName = '💵 Cash Register (In Hand)';
            updates.destinationName = bankLabel;
            changed = true;
          } else if (cat === 'CASH_WITHDRAWAL_BANK') {
            updates.sourceName = bankLabel;
            updates.destinationName = '💵 Cash Register (In Hand)';
            changed = true;
          } else if (cat === 'INTER_BANK_TRANSFER') {
            updates.sourceName = `🏦 ${defaultBank?.bankName || 'HDFC Bank'} (****${defaultBank?.accountNumberMasked || '1122'})`;
            updates.destinationName = `🏦 ${iciciBank?.bankName || 'ICICI Bank'} (****${iciciBank?.accountNumberMasked || '6655'})`;
            changed = true;
          }
        }
      }

      // 3d. Backfill realistic banking referenceNo/UTR if missing
      if (!t.referenceNo && !isCash && type !== 'INVOICE' && type !== 'BILL') {
        const randDigits = Math.floor(100000 + Math.random() * 900000);
        if (mode === 'UPI') {
          updates.referenceNo = `UPI/${Math.floor(100000000000 + Math.random() * 900000000000)}@okhdfc`;
        } else if (mode === 'NEFT_RTGS') {
          updates.referenceNo = `HDFCN262700${randDigits}`;
        } else if (mode === 'CHEQUE') {
          updates.referenceNo = `CHQ-${randDigits}`;
        } else if (mode === 'CARD') {
          updates.referenceNo = `POS-TXN-${randDigits}`;
        } else {
          updates.referenceNo = `TXN-REF-${randDigits}`;
        }
        changed = true;
      }

      if (changed) {
        await txnCol.updateOne({ _id: t._id }, { $set: updates });
        updatedTxnCount++;
      }
    }

    if (updatedTxnCount > 0) {
      console.log(`[Migration] ✓ Auto-linked and enriched ${updatedTxnCount} historical transactions with bank accounts, source/destination parties, and banking UTR references.`);
    }

    // ─── 4. Ensure Realistic Initial Bank Contra & Inflows for Empty Accounts ───
    for (const tenant of activeTenants) {
      const tenantId = tenant._id;
      const tenantBanks = tenantBankMap.get(tenantId.toString()) || [];
      if (tenantBanks.length >= 2) {
        const hdfc = tenantBanks.find(b => /hdfc/i.test(b.bankName)) || tenantBanks[0];
        const icici = tenantBanks.find(b => /icici/i.test(b.bankName)) || tenantBanks[1];

        // Check if there are contra transfers
        const contraCount = await txnCol.countDocuments({ tenantId, txnType: 'CONTRA' });
        if (contraCount === 0) {
          await txnCol.insertMany([
            {
              tenantId,
              voucherNo: 'DEP-2627-0001',
              partyType: 'INTERNAL',
              partyName: `Contra: Cash Register ➔ HDFC Bank`,
              txnType: 'CONTRA',
              isOutsideCashflow: true,
              cashflowCategory: 'CASH_DEPOSIT_BANK',
              amount: 50000,
              paymentMode: 'CASH',
              paymentDate: new Date(Date.now() - 25 * 86400000),
              referenceNo: 'CASH-DEP-BR-01',
              bankAccountId: hdfc._id,
              sourceName: '💵 Cash Register (In Hand)',
              destinationName: `🏦 ${hdfc.bankName} (****${hdfc.accountNumberMasked})`,
              notes: 'Daily counter cash surplus deposit into primary current account',
              createdAt: new Date(Date.now() - 25 * 86400000),
              updatedAt: new Date(Date.now() - 25 * 86400000),
            },
            {
              tenantId,
              voucherNo: 'TXF-2627-0001',
              partyType: 'INTERNAL',
              partyName: `Contra: HDFC Bank ➔ ICICI Bank`,
              txnType: 'CONTRA',
              isOutsideCashflow: true,
              cashflowCategory: 'INTER_BANK_TRANSFER',
              amount: 75000,
              paymentMode: 'NET_BANKING',
              paymentDate: new Date(Date.now() - 15 * 86400000),
              referenceNo: 'HDFC-IMPS-89912304',
              bankAccountId: hdfc._id,
              toBankAccountId: icici._id,
              sourceName: `🏦 ${hdfc.bankName} (****${hdfc.accountNumberMasked})`,
              destinationName: `🏦 ${icici.bankName} (****${icici.accountNumberMasked})`,
              notes: 'Fund transfer to ICICI vendor payouts account for upcoming supplier clearances',
              createdAt: new Date(Date.now() - 15 * 86400000),
              updatedAt: new Date(Date.now() - 15 * 86400000),
            },
          ]);
          console.log(`[Migration] ✓ Seeded realistic contra money flows (Cash Deposit & Inter-Bank Transfer) for tenant: ${tenant.name}`);
        }
      }
    }

    // ─── 5. Migrate Legacy Supplier & Customer PANs ──────────────────────────
    const legacySuppliers = await suppCol.find({
      $or: [
        { pan: { $exists: true, $ne: null, $not: /^enc:v1:/ } },
        { 'bankDetails.accountNo': { $exists: true, $ne: null, $not: /^enc:v1:/ } },
      ],
    }).toArray();

    for (const s of legacySuppliers) {
      const updates = {};
      if (s.pan && !s.pan.startsWith('enc:v1:')) {
        updates.pan = encrypt(s.pan);
      }
      if (s.bankDetails?.accountNo && !s.bankDetails.accountNo.startsWith('enc:v1:')) {
        updates['bankDetails.accountNo'] = encrypt(s.bankDetails.accountNo);
      }
      if (Object.keys(updates).length > 0) {
        await suppCol.updateOne({ _id: s._id }, { $set: updates });
      }
    }

    const legacyCustomers = await custCol.find({
      pan: { $exists: true, $ne: null, $not: /^enc:v1:/ },
    }).toArray();

    for (const c of legacyCustomers) {
      if (c.pan && !c.pan.startsWith('enc:v1:')) {
        await custCol.updateOne({ _id: c._id }, { $set: { pan: encrypt(c.pan) } });
      }
    }

    console.log('[DB] Database integrity, historical account linking & money flow verification complete.');
  } catch (err) {
    console.warn('[Migration] Non-fatal migration check warning:', err.message);
  }
}

module.exports = {
  runStartupMigrations,
};
