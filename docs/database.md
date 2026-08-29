# Database Schema & Entity Relationships

## Database Engine
- **MongoDB Atlas / MongoDB 7+**
- **ODM**: Mongoose with Schema Validation and Multi-Tenant Indexing.

---

## 1. Entity Hierarchy & Tenant Isolation

```
Tenant (Company Workspace)
 ├── Users (Team members) ── Role ── Permissions
 ├── Subscriptions ── Plan
 ├── Invoices (Platform SaaS billing)
 ├── AuditLogs & LoginHistories
 ├── Warehouses (Godowns)
 ├── Categories
 ├── Products (SKUs)
 ├── StockAdjustments (IN / OUT / TRANSFER)
 ├── Suppliers (Vendors)
 ├── Customers (Debtors)
 ├── BankAccounts (Multiple Bank Accounts / Treasury)
 ├── Sequences (INV, BILL, REC, PAY, ADJ, DEP, WTH, TXF)
 └── PaymentTransactions (Bills, Invoices, Receipts, Payments, Contra Transfers)
```

---

## 2. Collections Overview

| Collection | Model File | Scoped by `tenantId` | Key Indexes |
|---|---|---|---|
| `tenants` | `Tenant.js` | ❌ (Platform) | `email`, `status`, `createdAt` (includes `initialWorkingCapital`) |
| `users` | `User.js` | ✅ (`null` for SA) | `tenantId + email`, `tenantId + roleId` |
| `roles` | `Role.js` | ✅ (`null` for system) | `tenantId + name` |
| `plans` | `Plan.js` | ❌ (Platform) | `name` |
| `subscriptions` | `Subscription.js` | ✅ | `tenantId + status` |
| `invoices` | `Invoice.js` | ✅ | `tenantId + invoiceNumber` |
| `auditlogs` | `AuditLog.js` | ✅ | `tenantId + createdAt`, `resource` |
| `loginhistories` | `LoginHistory.js` | ✅ | `tenantId + loginAt` |
| `inv_categories` | `inv/Category.js` | ✅ | `tenantId + name`, `tenantId + code` |
| `inv_products` | `inv/Product.js` | ✅ | `tenantId + sku`, `tenantId + barcode` |
| `inv_warehouses` | `inv/Warehouse.js` | ✅ | `tenantId + code`, `tenantId + isDefault` |
| `inv_stock_adjustments`| `inv/StockAdjustment.js`| ✅ | `tenantId + voucherNo`, `productId + warehouseId` |
| `inv_suppliers` | `inv/Supplier.js` | ✅ | `tenantId + name`, `tenantId + gstin` |
| `inv_customers` | `inv/Customer.js` | ✅ | `tenantId + name`, `tenantId + gstin` |
| `inv_bank_accounts` | `inv/BankAccount.js` | ✅ | `tenantId + accountNumber + deletedAt`, `tenantId + isActive` |
| `inv_sequences` | `inv/Sequence.js` | ✅ | `tenantId + prefix + fiscalYear` |
| `inv_payment_transactions`| `inv/PaymentTransaction.js`| ✅ | `tenantId + voucherNo`, `tenantId + partyId + txnType`, `tenantId + bankAccountId` |

---

## 3. BankAccount Schema
Collection: `inv_bank_accounts` (`src/backend/src/models/inv/BankAccount.js`)

```javascript
{
  tenantId: ObjectId,           // Tenant workspace isolation (indexed)
  bankName: String,             // Bank Name (e.g. 'HDFC Bank', 'ICICI Bank', 'State Bank of India')
  accountName: String,          // Nickname/Title (e.g. 'Main Operations Current A/C')
  accountNumber: String,        // Bank Account Number (Unique per tenant)
  ifscCode: String,             // 11-digit IFSC code (e.g. 'HDFC0001234')
  branchName: String,           // Branch location / city
  accountType: String,          // 'CURRENT' | 'SAVINGS' | 'OVERDRAFT' | 'CASH_CREDIT' | 'VIRTUAL'
  upiId: String,                // UPI ID / VPA
  openingBalance: Number,       // Initial carry-forward balance in INR
  isDefault: Boolean,           // Primary collection/payout account flag
  isActive: Boolean,            // Active/Inactive state
  notes: String,
  deletedAt: Date,              // Soft delete timestamp
  createdBy: ObjectId
}
```

---

## 4. PaymentTransaction Schema & Subdocuments
Collection: `inv_payment_transactions` (`src/backend/src/models/inv/PaymentTransaction.js`)

```javascript
{
  tenantId: ObjectId,           // Tenant workspace isolation (indexed)
  voucherNo: String,            // Unique sequential voucher e.g. INV-2627-0101, REC-2627-0101, TXF-2627-0001
  
  partyType: String,            // 'CUSTOMER' | 'SUPPLIER' | 'OTHER' | 'EXTERNAL' | 'INTERNAL'
  partyId: ObjectId,            // Reference to InvCustomer or InvSupplier (null for outside flows / contra)
  partyModel: String,           // 'InvCustomer' | 'InvSupplier' | null
  partyName: String,            // Entity / Person Name for khata & outside flow

  txnType: String,              // 'BILL' | 'INVOICE' | 'PAYMENT_OUT' | 'PAYMENT_IN' | 'OPENING_BAL' | 'ADJUSTMENT' | 'OUTSIDE_INFLOW' | 'OUTSIDE_OUTFLOW' | 'CONTRA'
  isOutsideCashflow: Boolean,   // true for non-trading adjustments & contra, false for commercial trade
  cashflowCategory: String,     // 'CAPITAL_INJECTION' | 'OWNER_DRAWINGS' | 'RENT_AND_UTILITIES' | 'SALARY_AND_WAGES' | 'OFFICE_EXPENSES' | 'LOAN_RECEIVED' | 'LOAN_REPAYMENT' | 'BANK_CHARGES_TAX' | 'CASH_DEPOSIT_BANK' | 'CASH_WITHDRAWAL_BANK' | 'INTER_BANK_TRANSFER' | 'DIRECT_BANK_RECEIPT' | 'DIRECT_BANK_PAYMENT' | 'PETTY_CASH_EXPENSE' | 'OTHER_INFLOW' | 'OTHER_OUTFLOW'
  
  amount: Number,               // Transaction amount in INR (>= 0)
  paymentMode: String,          // 'CASH' | 'UPI' | 'NEFT_RTGS' | 'CHEQUE' | 'NET_BANKING' | 'CARD' | 'TRANSFER'
  paymentDate: Date,
  dueDate: Date,                // Term expiration date for INVOICE / BILL

  referenceNo: String,          // 12-digit UPI RRN / 16-digit Bank UTR / Cheque No
  bankAccount: String,          // Formatted account descriptor
  bankAccountId: ObjectId,      // Reference to InvBankAccount
  toBankAccountId: ObjectId,    // Target bank account for Inter-bank transfers
  
  sourceName: String,           // Explicit payer/source for Money Flow Tracking
  destinationName: String,      // Explicit recipient/destination for Money Flow Tracking
  transferType: String,         // 'PARTY_PAYMENT' | 'PARTY_RECEIPT' | 'OUTSIDE_INFLOW' | 'OUTSIDE_OUTFLOW' | 'CASH_DEPOSIT_BANK' | 'CASH_WITHDRAWAL_BANK' | 'INTER_BANK_TRANSFER'
  notes: String,

  // Bill-wise Knockoff Tracking (for BILL & INVOICE records)
  settledAmount: Number,        // Total amount settled against this bill
  paymentStatus: String,        // 'UNPAID' | 'PARTIALLY_PAID' | 'PAID'

  // Linked Allocations (for PAYMENT_IN & PAYMENT_OUT records)
  allocatedBills: [
    {
      billId: ObjectId,
      voucherNo: String,
      allocatedAmount: Number,
      remainingBillBalance: Number
    }
  ],

  stockLedgerId: ObjectId,      // Linked stock movement (if auto-generated from stock adjust)
  createdBy: ObjectId
}
```

---

## 4. Multi-Tenant Query Rules
- Every database query for tenant resources must specify `{ tenantId: req.tenantId }`.
- In atomic sequence operations (`nextSeq`), `{ returnDocument: 'after' }` is used to prevent race conditions.
- Soft-deletes are handled using `deletedAt: { $eq: null }`.
- Demo reseeds (`seed.js`) strictly scope cleanups to demo tenants (`Apex Retail`, `Nexus`, `Acme`), preserving all user-registered companies and customer data permanently.