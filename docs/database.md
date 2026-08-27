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
| `tenants` | `Tenant.js` | ❌ (Platform) | `email`, `status`, `createdAt` |
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

## 3. Bill-Wise Subdocument Schema
Inside `inv_payment_transactions`:
```json
{
  "voucherNo": "REC-2627-0102",
  "txnType": "PAYMENT_IN",
  "partyType": "CUSTOMER",
  "partyId": "6a8bf...",
  "amount": 40000,
  "settledAmount": 0,
  "paymentStatus": "PAID",
  "paymentMode": "NEFT_RTGS",
  "allocatedBills": [
    {
      "billId": "6a8e9...",
      "voucherNo": "INV-2627-0102",
      "allocatedAmount": 40000,
      "remainingBillBalance": 85000
    }
  ]
}
```

---

## 4. Multi-Tenant Query Rules
- Every database query for tenant resources must specify `{ tenantId: req.tenantId }`.
- In atomic sequence operations (`nextSeq`), `{ returnDocument: 'after' }` is used to prevent race conditions.
- Soft-deletes are handled using `deletedAt: { $eq: null }`.