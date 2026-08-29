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
 ├── Sequences (INV, BILL, REC, PAY, ADJ)
 └── PaymentTransactions (Bills, Invoices, Receipts, Payments)
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
| `inv_sequences` | `inv/Sequence.js` | ✅ | `tenantId + prefix + fiscalYear` |
| `inv_payment_transactions`| `inv/PaymentTransaction.js`| ✅ | `tenantId + voucherNo`, `partyId + txnType`, `allocatedBills.billId` |

---

## 3. PaymentTransaction Schema & Subdocuments
Collection: `inv_payment_transactions` (`src/backend/src/models/inv/PaymentTransaction.js`)

```javascript
{
  tenantId: ObjectId,           // Tenant workspace isolation (indexed)
  voucherNo: String,            // Unique sequential voucher e.g. INV-2627-0101, REC-2627-0101, ADJ-IN-2627-0001
  
  partyType: String,            // 'CUSTOMER' | 'SUPPLIER' | 'OTHER' | 'EXTERNAL'
  partyId: ObjectId,            // Reference to InvCustomer or InvSupplier (null for outside flows)
  partyModel: String,           // 'InvCustomer' | 'InvSupplier' | null
  partyName: String,            // Entity / Person Name for khata & outside flow

  txnType: String,              // 'BILL' | 'INVOICE' | 'PAYMENT_OUT' | 'PAYMENT_IN' | 'OPENING_BAL' | 'ADJUSTMENT' | 'OUTSIDE_INFLOW' | 'OUTSIDE_OUTFLOW'
  isOutsideCashflow: Boolean,   // true for non-trading adjustments, false for commercial trade
  cashflowCategory: String,     // 'CAPITAL_INJECTION' | 'OWNER_DRAWINGS' | 'RENT_AND_UTILITIES' | 'SALARY_AND_WAGES' | 'OFFICE_EXPENSES' | 'LOAN_RECEIVED' | 'LOAN_REPAYMENT' | 'BANK_CHARGES_TAX' | 'OTHER_INFLOW' | 'OTHER_OUTFLOW'
  
  amount: Number,               // Transaction amount in INR (>= 0)
  paymentMode: String,          // 'CASH' | 'UPI' | 'NEFT_RTGS' | 'CHEQUE' | 'NET_BANKING' | 'CARD'
  paymentDate: Date,
  dueDate: Date,                // Term expiration date for INVOICE / BILL

  referenceNo: String,          // 12-digit UPI RRN / UTR / Cheque No
  bankAccount: String,
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