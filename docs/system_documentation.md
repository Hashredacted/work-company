# WorkSpace — Multi-Tenant SaaS & Inventory ERP Platform
### Complete System Documentation

> **Server**: `http://localhost:5000` · **DB**: MongoDB Atlas · **Stack**: Node.js + Express 5 + MongoDB (Mongoose) + Vanilla HTML/CSS/JS

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Directory Structure](#3-directory-structure)
4. [Data Models](#4-data-models)
   - [Core SaaS Entities](#core-saas-entities)
   - [Inventory & ERP Entities](#inventory--erp-entities)
   - [Payments & Khata Ledger Entities](#payments--khata-ledger-entities)
5. [RBAC — Roles & Permissions](#5-rbac--roles--permissions)
6. [API Reference](#6-api-reference)
   - [Auth, Users, Roles, Billing & Audit APIs](#auth-users-roles-billing--audit-apis)
   - [Inventory, Products, Warehouses & Stock APIs](#inventory-products-warehouses--stock-apis)
   - [Suppliers, Customers & Party APIs](#suppliers-customers--party-apis)
   - [Payments, Bill-Wise Knockoff & Khata APIs](#payments-bill-wise-knockoff--khata-apis)
   - [Reports & Analytics APIs](#reports--analytics-apis)
7. [Frontend Pages](#7-frontend-pages)
8. [Bill-Wise Payment & Khata Ledger System](#8-bill-wise-payment--khata-ledger-system)
9. [Indian Trade & Statutory Compliance](#9-indian-trade--statutory-compliance)
10. [Security Model](#10-security-model)
11. [Tenant Lifecycle](#11-tenant-lifecycle)
12. [Billing & Plans](#12-billing--plans)
13. [Audit System](#13-audit-system)
14. [Demo Accounts & Test Scenarios](#14-demo-accounts--test-scenarios)
15. [Environment Variables & Running the Project](#15-environment-variables--running-the-project)

---

## 1. System Overview

WorkSpace is a **multi-tenant B2B SaaS & Inventory ERP platform** designed for wholesale, retail, and manufacturing enterprises in India. Each tenant operates in complete database isolation (`tenant_id` filter) and gets access to:
- **Core SaaS Platform**: User management, custom Role-Based Access Control (RBAC), 7-day free trial lifecycle, subscription billing, and audit logging.
- **Inventory & Multi-Godown ERP**: Multi-warehouse stock tracking, stock adjustments (IN/OUT/TRANSFER), real-time stock valuation (FIFO/Weighted Average), low-stock & expiry alerts.
- **Party Directory**: Dedicated customer and supplier registers with GSTIN validation, state codes, credit limits, and credit terms (payment days).
- **Bill-Wise Payment Knockoff & Khata Bahi (खाता बही)**:
  - Knock off receipts/payments against specific open invoices (`INVOICE`) or purchase bills (`BILL`).
  - Real-time remaining balance calculations per bill and per party.
  - FIFO auto-allocation & on-account advance credits.
  - Per-day payment collections and disbursements timeline.
  - Double-entry ledger generation (Statement) with running balances and printable statements.
  - WhatsApp payment reminder generator with custom bilingual templates.

---

## 2. Architecture

```
┌────────────────────────────────────────────────────────┐
│                      Browser Client                     │
│   HTML/CSS/JS (Vanilla) served from Express static     │
└────────────────────┬───────────────────────────────────┘
                     │  HTTP/REST (JSON)
┌────────────────────▼───────────────────────────────────┐
│              Express 5 Application Server               │
│                  (src/backend/src/app.js)               │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐            │
│  │ Middleware│  │  Routes  │  │Controllers │            │
│  │ Helmet CSP│  │ /api/auth│  │  auth.js  │            │
│  │ cors()   │  │ /api/inv │  │  inv/*.js │            │
│  │ json()   │  │ /api/... │  │  payment.js│           │
│  └──────────┘  └──────────┘  └───────────┘            │
│                                                         │
│  ┌────────────────────────────────────┐                │
│  │         Auth & Tenant Middleware   │                │
│  │  authenticate → resolveTenant      │                │
│  │      → authorize('perm:action')   │                │
│  │      → financialLimiter (269ST)    │                │
│  └────────────────────────────────────┘                │
└────────────────────┬───────────────────────────────────┘
                     │  Mongoose ODM (with sequence counters)
┌────────────────────▼───────────────────────────────────┐
│                  MongoDB Atlas                           │
│  Collections: users, tenants, roles, plans,             │
│  subscriptions, invoices, auditlogs, loginhistories,    │
│  inv_products, inv_categories, inv_warehouses,          │
│  inv_stock_adjustments, inv_suppliers, inv_customers,   │
│  inv_payment_transactions, inv_sequences                │
└────────────────────────────────────────────────────────┘
```

---

## 3. Directory Structure

```
work company/
├── .env                                  ← Root env (MONGODB_URI, JWT_SECRET, etc.)
├── docs/                                 ← System documentation & architectural specs
│   ├── system_documentation.md
│   ├── api.md
│   ├── database.md
│   ├── architecture.md
│   ├── rbac.md
│   ├── subscription.md
│   └── development.md
├── src/
│   ├── backend/
│   │   ├── package.json
│   │   └── src/
│   │       ├── app.js                    ← Express app with Helmet CSP & routes
│   │       ├── config/
│   │       │   └── db.js                 ← MongoDB connection
│   │       ├── controllers/
│   │       │   ├── auth.js               ← Auth & Profile
│   │       │   ├── company.js            ← Tenant management
│   │       │   ├── billing.js            ← Subscriptions & plans
│   │       │   ├── dashboard.js          ← Super Admin metrics
│   │       │   ├── role.js & user.js     ← RBAC & Team
│   │       │   ├── audit.js              ← Audit logs & Login history
│   │       │   └── inventory/
│   │       │       ├── category.js       ← Item categories
│   │       │       ├── product.js        ← Catalog & stock levels
│   │       │       ├── warehouse.js      ← Godowns & multi-loc stock
│   │       │       ├── stockAdjustment.js← In/Out/Transfer movements
│   │       │       ├── supplier.js       ← Vendor register
│   │       │       ├── customer.js       ← Debtor register
│   │       │       ├── payment.js        ← Bill-wise payments, Khata & Daily analytics
│   │       │       └── report.js         ← Stock valuation & dashboard KPIs
│   │       ├── middlewares/
│   │       │   ├── auth.js               ← authenticate, resolveTenant, authorize
│   │       │   ├── security.js           ← Helmet CSP & Section 269ST limiters
│   │       │   ├── validateObjectId.js   ← Mongoose ID guard
│   │       │   └── error.js              ← Global error handler
│   │       ├── models/
│   │       │   ├── Tenant.js, User.js, Role.js, Plan.js, Subscription.js, Invoice.js
│   │       │   ├── AuditLog.js, LoginHistory.js, PasswordResetToken.js
│   │       │   └── inv/
│   │       │       ├── Category.js, Product.js, Warehouse.js, StockAdjustment.js
│   │       │       ├── Supplier.js, Customer.js, Sequence.js
│   │       │       └── PaymentTransaction.js ← Bill-wise transactions & settlements
│   │       ├── routes/
│   │       │   ├── auth.js, company.js, billing.js, dashboard.js, role.js, user.js, audit.js
│   │       │   └── inventory.js          ← Central inventory & payment router
│   │       ├── utils/
│   │       │   └── sequence.js           ← Atomic financial voucher counter (INV/REC/BILL/PAY)
│   │       └── scripts/
│   │           ├── seed.js               ← SaaS core seeder
│   │           ├── seed_payment_cases.js ← 7 realistic trade scenarios
│   │           ├── test_payments.js      ← Automated test suite for payments
│   │           └── validate_frontend_scripts.js ← Syntax compiler
│   └── frontend/
│       ├── index.html                    ← Login & Quick-fill
│       ├── register.html                 ← Company registration / trial
│       ├── forgot-password.html / reset-password.html
│       ├── dashboard.html                ← Super Admin portal
│       ├── company-dashboard.html        ← Company Admin dashboard
│       ├── users.html, billing.html, audit.html, profile.html
│       ├── inv-dashboard.html            ← Inventory ERP overview & alerts
│       ├── inv-products.html             ← Catalog & quick stock
│       ├── inv-suppliers.html            ← Supplier payables & ledger
│       ├── inv-customers.html            ← Customer receivables & ledger
│       ├── inv-payments.html             ← Bill-wise payments, daily summary & Khata Bahi
│       ├── inv-reports.html              ← Valuation & Stock Ledger
│       └── style.css                     ← Global dark-mode UI design system
```

---

## 4. Data Models

### Core SaaS Entities

| Model | Collection | Purpose | Key Fields |
|---|---|---|---|
| **Tenant** | `tenants` | Company workspace | `name`, `email`, `gst`, `status` (`TRIAL`, `ACTIVE`, `EXPIRED`), `trialEndsAt`, `planId` |
| **User** | `users` | Team member / admin | `tenantId`, `name`, `email`, `password` (bcrypt), `roleId`, `lastLoginAt`, `isActive` |
| **Role** | `roles` | RBAC Definition | `tenantId` (`null` for system), `name`, `permissions` (`[String]`), `isSystemRole` |
| **Plan** | `plans` | Subscription tier | `name`, `price.monthly`, `price.yearly`, `limits`, `isFree` |
| **Subscription** | `subscriptions` | Active billing plan | `tenantId`, `planId`, `status`, `currentPeriodEnd`, `autoRenew` |
| **Invoice** | `invoices` | Platform SaaS billing | `tenantId`, `invoiceNumber`, `subtotal`, `tax` (18%), `total`, `status` |
| **AuditLog** | `auditlogs` | Immutable audit trail | `tenantId`, `userId`, `action`, `resource`, `resourceId`, `details`, `ip` |
| **LoginHistory** | `loginhistories` | User login track | `tenantId`, `userId`, `ip`, `userAgent`, `loginAt` |

### Inventory & ERP Entities

| Model | Collection | Purpose | Key Fields |
|---|---|---|---|
| **Product** | `inv_products` | Inventory SKU / item | `tenantId`, `name`, `sku`, `barcode`, `hsnCode`, `categoryId`, `unit`, `purchasePrice`, `sellingPrice`, `minStockLevel`, `stockQuantity`, `valuationMethod` |
| **Category** | `inv_categories` | Product grouping | `tenantId`, `name`, `code`, `description`, `parentCategory` |
| **Warehouse** | `inv_warehouses` | Storage godown | `tenantId`, `name`, `code`, `address`, `city`, `state`, `isDefault` |
| **StockAdjustment** | `inv_stock_adjustments` | Stock movements | `tenantId`, `voucherNo`, `productId`, `warehouseId`, `type` (`IN`, `OUT`, `TRANSFER`), `quantity`, `unitCost`, `supplierId`, `customerId`, `paymentStatus` |
| **Supplier** | `inv_suppliers` | Vendor register | `tenantId`, `name`, `contactName`, `phone`, `email`, `gstin`, `state`, `paymentTerms` (days), `creditLimit`, `bankDetails` |
| **Customer** | `inv_customers` | Debtor register | `tenantId`, `name`, `contactName`, `phone`, `email`, `gstin`, `state`, `paymentTerms` (days), `creditLimit`, `billingAddress` |
| **BankAccount** | `inv_bank_accounts` | Bank Treasury A/Cs | `tenantId`, `bankName`, `accountName`, `accountNumber`, `ifscCode`, `branchName`, `accountType`, `upiId`, `openingBalance`, `isDefault`, `isActive` |
| **Sequence** | `inv_sequences` | Atomic sequence counters | `tenantId`, `prefix` (`INV`, `BILL`, `REC`, `PAY`, `ADJ`, `DEP`, `WTH`, `TXF`), `currentSeq`, `fiscalYear` |

### Payments, Treasury & Khata Ledger Entities

#### `BankAccount` (`inv_bank_accounts`)
Manages multiple registered bank accounts per tenant company with automatic live balance computations:

| Field | Type | Description |
|---|---|---|
| `tenantId` | `ObjectId → Tenant` | Tenant scoping |
| `bankName` | `String` | Bank Name (e.g. HDFC Bank, ICICI Bank, State Bank of India) |
| `accountName` | `String` | Account display name / purpose |
| `accountNumber` | `String` | Unique bank account number per company |
| `ifscCode` | `String` | 11-digit IFSC code |
| `branchName` | `String` | Branch name & city |
| `accountType` | `Enum` | `CURRENT` \| `SAVINGS` \| `OVERDRAFT` \| `CASH_CREDIT` \| `VIRTUAL` |
| `upiId` | `String` | UPI ID / VPA handle |
| `openingBalance` | `Number` | Initial carry-forward balance in INR |
| `isDefault` | `Boolean` | Flag indicating the primary default account for payouts/collections |
| `isActive` | `Boolean` | Active status |

#### `PaymentTransaction` (`inv_payment_transactions`)
Represents all financial bills, sales invoices, receipts, payments, and contra transfers:

| Field | Type | Description |
|---|---|---|
| `tenantId` | `ObjectId → Tenant` | Tenant scoping |
| `voucherNo` | `String` | Unique voucher number (e.g. `REC-2627-0102`, `INV-2627-0101`, `TXF-2627-0001`) |
| `partyType` | `Enum` | `CUSTOMER` \| `SUPPLIER` \| `OTHER` \| `EXTERNAL` \| `INTERNAL` |
| `partyId` | `ObjectId` | Linked customer or supplier ID |
| `partyModel` | `Enum` | `InvCustomer` \| `InvSupplier` \| null |
| `txnType` | `Enum` | `INVOICE` \| `BILL` \| `PAYMENT_IN` \| `PAYMENT_OUT` \| `OPENING_BAL` \| `ADJUSTMENT` \| `OUTSIDE_INFLOW` \| `OUTSIDE_OUTFLOW` \| `CONTRA` |
| `amount` | `Number` | Total transaction amount in INR (₹) |
| `settledAmount` | `Number` | Amount knocked off / settled so far (default: 0) |
| `paymentStatus` | `Enum` | `UNPAID` \| `PARTIALLY_PAID` \| `PAID` |
| `paymentMode` | `Enum` | `CASH` \| `UPI` \| `NEFT_RTGS` \| `CHEQUE` \| `NET_BANKING` \| `CARD` \| `TRANSFER` |
| `paymentDate` | `Date` | Date of payment or bill issuance |
| `dueDate` | `Date` | Credit due date (calculated via party `paymentTerms`) |
| `referenceNo` | `String` | 12-digit UTR/RRN, Cheque number, or receipt reference |
| `bankAccount` | `String` | Bank name and formatted account number |
| `bankAccountId` | `ObjectId → InvBankAccount` | Linked Bank Account ID |
| `toBankAccountId` | `ObjectId → InvBankAccount` | Target Bank Account ID for inter-bank transfers |
| `sourceName` | `String` | Payer/Source involved in money flow |
| `destinationName` | `String` | Recipient/Destination involved in money flow |
| `transferType` | `Enum` | `PARTY_PAYMENT` \| `PARTY_RECEIPT` \| `OUTSIDE_INFLOW` \| `OUTSIDE_OUTFLOW` \| `CASH_DEPOSIT_BANK` \| `CASH_WITHDRAWAL_BANK` \| `INTER_BANK_TRANSFER` |
| `allocatedBills` | `[SubDoc]` | Array of linked bill knockoffs: `[{ billId, voucherNo, allocatedAmount, remainingBillBalance }]` |
| `notes` | `String` | Narration / particulars |
| `createdBy` | `ObjectId → User` | User who recorded the transaction |

---

## 5. RBAC — Roles & Permissions

All permissions use `resource:action` strings.

### Permission Keys
- `company:read`, `company:create`, `company:update`, `company:delete`
- `user:read`, `user:create`, `user:update`, `user:delete`
- `role:read`, `role:create`, `role:update`, `role:delete`
- `billing:read`, `billing:manage`
- `inventory:read`, `inventory:manage`
- `audit:read`

---

## 6. API Reference

All responses follow standard JSON structure: `{ "data": ..., "message": "OK", "errors": null }`.

### Auth, Users, Roles & Billing APIs

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Sign in, returns JWT & user payload |
| `GET` | `/api/auth/me` | User | Current profile, permissions & tenant |
| `POST` | `/api/auth/forgot-password` | Public | Generate reset token |
| `POST` | `/api/auth/reset-password` | Public | Reset password with token |
| `GET` | `/api/users` | `user:read` | List tenant team members |
| `POST` | `/api/users` | `user:create` | Add team member |
| `GET` | `/api/roles` | `role:read` | List system & custom roles |
| `POST` | `/api/roles` | `role:create` | Create custom role |
| `GET` | `/api/billing/plans` | Public | List available subscription tiers |
| `POST` | `/api/billing/subscribe` | `billing:manage` | Subscribe to plan |

### Inventory, Products & Warehouses APIs

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/inventory/products` | `inventory:read` | List products with pagination & search |
| `POST` | `/api/inventory/products` | `inventory:manage` | Create new SKU/product |
| `PUT` | `/api/inventory/products/:id` | `inventory:manage` | Update product details |
| `GET` | `/api/inventory/warehouses` | `inventory:read` | List godowns / warehouses |
| `POST` | `/api/inventory/warehouses` | `inventory:manage` | Create warehouse |
| `POST` | `/api/inventory/stock-adjust` | `inventory:manage` | Stock In/Out/Transfer (auto creates Bill/Invoice if on credit) |

### Suppliers, Customers & Parties APIs

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/inventory/suppliers` | `inventory:read` | List vendors with balances & credit terms |
| `POST` | `/api/inventory/suppliers` | `inventory:manage` | Create vendor with GSTIN & Bank details |
| `PUT` | `/api/inventory/suppliers/:id` | `inventory:manage` | Update vendor profile |
| `GET` | `/api/inventory/customers` | `inventory:read` | List debtors with balances & credit limits |
| `POST` | `/api/inventory/customers` | `inventory:manage` | Create debtor with GSTIN & terms |
| `PUT` | `/api/inventory/customers/:id` | `inventory:manage` | Update customer profile |

### Payments, Bill-Wise Knockoff & Khata APIs

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/inventory/payments/kpis` | `inventory:read` | Overall Receivables, Payables, Overdue, Working Capital (supports `X-Tenant-Id`) |
| `GET` | `/api/inventory/payments/outstandings` | `inventory:read` | Party-wise outstandings (`type=CUSTOMER\|SUPPLIER`) |
| `GET` | `/api/inventory/payments/pending-bills` | `inventory:read` | Fetch open unpaid bills/invoices for a party with remaining balances |
| `GET` | `/api/inventory/payments/daily-summary` | `inventory:read` | Per-day inflow, outflow, net cashflow, and payment mode breakdown |
| `GET` | `/api/inventory/payments/statement/:type/:id` | `inventory:read` | Double-entry Khata Bahi with running balances and knockoffs |
| `GET` | `/api/inventory/payments/voucher/:voucherNoOrId` | `inventory:read` | Full document view for invoices, bills, receipts, payments, and adjustments |
| `GET` | `/api/inventory/payments` | `inventory:read` | Paginated voucher list with multi-type filters (`INVOICE`, `BILL`, `PAYMENT_IN`, `PAYMENT_OUT`, `OUTSIDE`, `OPENING_BAL`) |
| `POST` | `/api/inventory/payments` | `inventory:manage` | Record Payment Voucher with manual or FIFO bill knockoff (Section 269ST guarded) |
| `POST` | `/api/inventory/payments/outside-cashflow` | `inventory:manage` | Add (+ Inflow) or Subtract (- Outflow) non-trading funds from Cash in Hand or Bank/UPI |

### Finance, Multi-Bank & Cash Management APIs

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/inventory/finance/summary` | `inventory:read` | High-level summary of Cash in Hand, Multi-Bank balances, Total Inflow, Total Outflow, and Today's stats |
| `GET` | `/api/inventory/finance/bank-accounts` | `inventory:read` | List all registered bank accounts with calculated live balances and transaction metrics |
| `POST` | `/api/inventory/finance/bank-accounts` | `inventory:manage` | Register new bank account with duplicate checking and opening balance |
| `GET` | `/api/inventory/finance/bank-accounts/:id`| `inventory:read` | Retrieve specific bank account details and recent transactions |
| `PUT` | `/api/inventory/finance/bank-accounts/:id`| `inventory:manage` | Update bank account parameters (name, IFSC, branch, UPI, type, status) |
| `DELETE` | `/api/inventory/finance/bank-accounts/:id`| `inventory:manage` | Soft-delete bank account |
| `PUT` | `/api/inventory/finance/bank-accounts/:id/set-default`| `inventory:manage` | Set primary default account for payouts and collections |
| `GET` | `/api/inventory/finance/flow` | `inventory:read` | Unified Money Flow statement with party tracing (who sent what to which account) and direction filters |
| `POST` | `/api/inventory/finance/transfer` | `inventory:manage` | Record Contra fund transfer (Cash-to-Bank, Bank-to-Cash, Bank-to-Bank) |
| `POST` | `/api/inventory/finance/quick-entry` | `inventory:manage` | Direct Inflow/Outflow financial entry with party and category attribution |

---

## 7. Frontend Pages

| Page | URL | Purpose |
|---|---|---|
| **Login** | `index.html` | Authentication with top tab switcher and demo role quick-fill |
| **Registration** | `register.html` | 7-day trial company signup with instant workspace provisioning |
| **Super Admin** | `dashboard.html` | Platform-level tenant & revenue controls |
| **Company Admin** | `company-dashboard.html` | Workspace hub with grouped pill navigation and profile badge |
| **Inventory Dashboard** | `inv-dashboard.html` | Stock valuation, Retail Trading bills, Liquidity cards, Outside Cash Flow modal |
| **Products** | `inv-products.html` | Product catalog, barcode, HSN, Quick Stock modal |
| **Customers** | `inv-customers.html` | Customer directory, credit terms, outstanding receivables |
| **Suppliers** | `inv-suppliers.html` | Vendor directory, bank details, outstanding payables |
| **Finance Master** | `inv-finance.html` | Liquid Cash in Hand register, Multi-Bank Accounts manager, Contra Transfers, and real-time Money Flow tracing |
| **Payments & Khata** | `inv-payments.html` | Bill-wise knockoff, Outside Cash Flow modal, multi-type voucher pills, party statements, WhatsApp reminders |
| **Reports** | `inv-reports.html` | Valuation summary (FIFO/Average) and stock ledgers |

---

## 8. Bill-Wise Payment & Liquidity Management System

### 1. Commercial Knockoff Settlement Flow
```
User Records Payment In (₹40,000) for Customer Apex Tech
  ├── System fetches open INVOICE vouchers (e.g. INV-2627-0102: ₹1,25,000 total, ₹1,25,000 pending)
  ├── User allocates ₹40,000 to INV-2627-0102 (or clicks ⚡ Auto-Knockoff FIFO)
  ├── Modal previews in real-time:
  │     • Bill Remaining Balance: ₹85,000
  │     • Party Remaining Due: ₹85,000
  ├── Backend saves REC-2627-0102:
  │     • Updates INV-2627-0102: settledAmount = 40000, paymentStatus = 'PARTIALLY_PAID'
  │     • Saves allocatedBills array on REC-2627-0102
  └── Khata Statement and Outstandings update atomically.
```

### 2. Outside Cash Flow & Liquidity Adjustments
```
User Injects Capital or Records Business Overhead
  ├── User opens "⚡ Outside Cash Flow / Adjust Balance" Modal
  ├── Selects Direction: ➕ Add (Inflow) or ➖ Subtract (Outflow)
  ├── Selects Target Account: 💵 Cash in Hand (CASH) or 🏛️ Bank / UPI (UPI, NEFT, Cheque)
  ├── Selects Category: Capital Injection, Owner Drawings, Rent & Utilities, Salary/Wages, Loan, Bank Charges
  ├── Backend saves ADJ-IN-2627-XXXX or ADJ-OUT-2627-XXXX:
  │     • Marks isOutsideCashflow = true
  │     • Adjusts real-time Cash in Hand or Bank/UPI balance
  │     • Leaves commercial sales/purchase trading turnover completely pure
  └── Daily cashflow summary reflects total operating liquidity.
```

### 3. Live Remaining Balance Preview
When the user types an amount or changes allocations in the payment modal, the system dynamically calculates:
$$\text{Remaining Party Due} = \max(0, \text{Current Outstanding} - \text{Total Payment})$$
$$\text{Remaining Bill Balance} = \max(0, \text{Bill Pending Amount} - \text{Current Allocation})$$

### 4. Per-Day Analytics (`/payments/daily-summary`)
Provides daily financial monitoring:
- **Today's Inflow**: Total receipts from customers today.
- **Today's Outflow**: Total payments to suppliers today.
- **Today's Net Cashflow**: Inflow minus Outflow.
- **30-Day Timeline Table**: Daily breakdown with payment modes (UPI, NEFT, Cheque, Cash).

---

## 9. Indian Trade & Statutory Compliance

1. **GST Compliance**:
   - 15-character GSTIN validation (`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`).
   - 2-digit Indian State code mapping (e.g. `27` for Maharashtra, `07` for Delhi).
   - Standard 18% GST calculation on software & services invoices.
2. **Income Tax Act — Section 269ST**:
   - Cash transactions $\ge ₹2,00,000$ in a single day or for a single transaction are blocked at the middleware layer (`financialLimiter`).
   - Frontend provides warning banners when selecting `CASH` mode.
3. **Payment Modes Supported**:
   - `UPI`: 12-digit UTR/RRN tracking for PhonePe, Google Pay, Paytm, BHIM.
   - `NEFT_RTGS`: Bank UTR transaction reference tracking.
   - `CHEQUE`: 6-digit cheque number and bank name with clearance tracking.
   - `CASH`: Cash counter receipt reference.
   - `NET_BANKING`: Corporate net banking reference.

---

## 10. Security Model & Defense-in-Depth Architecture

The platform implements multi-layered enterprise defense-in-depth so that **even in the event of an infrastructure breach or raw database dump, zero sensitive credentials or financial identifiers leak**:

1. **Field-Level AES-256-GCM Encryption at Rest**:
   - Sensitive financial and tax identifiers (`BankAccount.accountNumber`, `BankAccount.upiId`, `Supplier.pan`, `Supplier.bankDetails.accountNo`, `Customer.pan`) are encrypted in MongoDB Atlas using AES-256-GCM with authenticated tags and random 12-byte IVs (`enc:v1:<iv>:<authTag>:<ciphertext>`).
   - Deterministic HMAC-SHA-256 Blind Indexing (`accountNumberHash`) allows high-speed unique constraint enforcement and indexed lookups without exposing plaintext in database storage.
2. **Zero-Leak Logging & Audit Redaction**:
   - Pre-save hooks automatically scrub passwords, Bearer tokens, DB connection passwords, authorization headers, and raw financial identifiers from `AuditLog` documents.
   - Centralized error handlers strip internal stack traces, system paths, and duplicate key secret payloads from API error responses.
3. **Model & Password Hardening**:
   - `User.password` configured with `select: false` to prevent password hashes from being queried or leaked in memory or serialized responses.
   - Masked representations (`accountNumberMasked`: `•••• •••• 1234`) are provided for secure frontend rendering.
4. **HTTP & Injection Hardening**:
   - `x-powered-by` header disabled across Express.
   - Helmet headers: Anti-clickjacking (`X-Frame-Options: DENY`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` (disables camera, microphone, geolocation).
   - Deep NoSQL Injection Sanitizer: Recursively scrubs MongoDB operators (`$`, `.`, `$where`, `$regex`, `$gt`, `$ne`, null-bytes) from all incoming requests.
5. **Multi-Tenant Isolation**:
   - Strict `tenantId` query scoping enforced across all operational controllers and routes.
6. **Rate Limiting & Financial Guards**:
   - Express rate limiters on login, registration, and financial payment endpoints.
   - Statutory Section 269ST limits blocking single cash transactions $> ₹2,00,000$.

---

## 11. Tenant Lifecycle

```
  Company Registers
        │
        ▼
    ┌───────┐
    │ TRIAL │  ← 7-day free trial, all ERP & payment features active
    └───┬───┘
        │ Subscribes to plan
        ▼
    ┌────────┐
    │ ACTIVE │  ← Full paying enterprise tenant
    └───┬────┘
        │ Trial expires without renewal
        ▼
    ┌─────────┐
    │ EXPIRED │  ← Read-only access with upgrade warnings
    └─────────┘
        │ Suspended by admin
        ▼
    ┌───────────┐
    │ SUSPENDED │  ← Complete lockout
    └───────────┘
```

---

## 12. Billing & Plans

| Plan | Monthly | Yearly | Users | Godowns | Custom Roles | ERP Features |
|---|---|---|---|---|---|---|
| **Free** | $0 | $0 | 3 | 1 | ❌ | Basic Products |
| **Starter** | $29 | $290 | 10 | 3 | ✅ | Full Inventory & Stock In/Out |
| **Pro** | $79 | $790 | 50 | 10 | ✅ | Bill-Wise Payments & Khata Bahi |
| **Enterprise** | $199 | $1,990 | Unlimited | Unlimited | ✅ | Full Analytics & Priority Support |

---

## 13. Audit System

Every critical action is logged to `AuditLog`:
- `AUTH_LOGIN`, `USER_CREATE`, `USER_UPDATE`, `ROLE_CREATE`
- `STOCK_IN`, `STOCK_OUT`, `STOCK_TRANSFER`
- `PAYMENT_IN`, `PAYMENT_OUT`, `STATUS_CHANGE`

---

## 14. Demo Accounts & Test Scenarios

### Demo Credentials

| Role | Email | Password | Access |
|---|---|---|---|
| **Super Admin** | `admin@platform.com` | `Admin@1234` | Full platform control |
| **Company Admin** (Acme) | `admin@acme.com` | `Password@123` | Acme Inventory ERP & Payments |
| **Team User** (Acme) | `user@acme.com` | `Password@123` | Read-only operations |

### 7 Seeded B2B Trade Scenarios

Populated via `node src/scripts/seed_payment_cases.js`:
1. **VIP Clean Payer** (*Sharma Retail Store*): 100% cleared invoice via UPI (`INV-2627-0101` ₹15,000 cleared by `REC-2627-0101`).
2. **Multi-Installment Split** (*Apex Tech Distributors*): ₹1,25,000 invoice (`INV-2627-0102`) partially paid in 2 tranches (₹40,000 NEFT + ₹35,000 Cheque), leaving ₹50,000 pending due.
3. **Critical Overdue Debtor** (*Gupta General Trading Co.*): ₹68,500 invoice (`INV-2627-0103`) unpaid for 60 days (30 days overdue $\rightarrow$ Critical status).
4. **FIFO Multi-Bill Supplier Payables** (*Bharat Electronics Distributors*): ₹30,000 payment (`PAY-2627-0101`) knocked off across 3 purchase bills in FIFO order.
5. **Section 269ST Compliant Cash** (*Kalyan Electronics*): ₹1,40,000 bulk purchase settled via compliant cash receipt ($< ₹2\text{L}$).
6. **Advance / On-Account Credit** (*Metro IT Solutions*): ₹25,000 advance receipt recorded without linking to bills.
7. **PDC / Cheque Realization** (*SuperTech Component Suppliers*): ₹42,000 purchase bill settled via realized bank cheque.

---

## 15. Environment Variables & Running the Project

### `.env` Configuration
```env
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secure-jwt-secret-key-32-chars
JWT_EXPIRES_IN=7d
SUPER_ADMIN_EMAIL=admin@platform.com
SUPER_ADMIN_PASSWORD=Admin@1234
SUPER_ADMIN_NAME=Super Admin
```

### Setup & Run Commands
```bash
# Install dependencies
cd src/backend
npm install

# Seed database with core SaaS & 7 Payment scenarios
npm run seed
node src/scripts/seed_payment_cases.js

# Run integration tests
node src/scripts/test_payments.js

# Start development server
npm run dev
```

---

*Last Updated: 2026-08-26 | WorkSpace Multi-Tenant SaaS & Inventory ERP Platform v2.0*
