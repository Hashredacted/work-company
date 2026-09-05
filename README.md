# WorkSpace — Multi-Tenant SaaS & Inventory ERP Platform

WorkSpace is an enterprise-grade multi-tenant B2B SaaS platform combined with an Inventory & Double-Entry Payment Khata ERP designed for Indian enterprises, distributors, and modern retail chains.

---

## 🚀 Key Modules & Architecture

### 1. Multi-Tenant SaaS Core & RBAC
- **Company Registration & 7-Day Free Trial**: Automatic trial management (`TRIAL` $\rightarrow$ `ACTIVE` $\rightarrow$ `EXPIRED` $\rightarrow$ `SUSPENDED`) with zero-friction onboarding.
- **Role-Based Access Control (RBAC)**: Fine-grained permissions for Super Admin, Company Admin, Managers, and Custom Roles.
- **Strict Tenant Data Isolation**: Every database query enforces the `tenantId` filter (`req.tenantId` / `getTenantId(req)`).
- **Persistent Data Guarantee**: User-registered companies and custom transactions are 100% persisted across server restarts, nodemon reloads, and demo reseeds.
- **Platform Analytics**: Super Admin KPI dashboard tracking cross-tenant revenue, subscriptions, and tenant lifecycles.

### 2. Modern Accounting SaaS Navigation Sidebar
- **Split-Pill Quick Create Action**: Persistent button with direct `+ Create Sales Invoice` link and interactive flyout menu for 1-click creation of Sales Invoices, Purchase Bills, Quotations, Payments In/Out, and Items.
- **Plans & Pricing Banner**: Direct access to plan upgrades and billing management.
- **Structured Accordion Navigation**: Organized under `GENERAL` with collapsible groups for **Parties**, **Items**, **Sales**, **Purchases**, and **Reports**, highlighting active pages in glowing solid indigo pills (`#3949ab`).
- **Dynamic System Navigation Footer**: Includes **`← Back to Main`** (dynamically routes to Platform Dashboard for SuperAdmins or Company Dashboard for Tenant users) and **`Sign Out`** (with confirmation dialog and token cleanup).
- **Trust Badges**: Persistent 100% Secure and ISO Certified trust badges.

### 3. Consolidated Utility Architecture
- **Frontend Utilities Bundle (`AppUtils` / `app-utils.js`)**:
  - **Universal Dropdown Engine (`dropdown.js`)**: Standardized populators (`populateProductDropdown`, `populatePartyDropdown`, `populateWarehouseDropdown`, `populateCategoryDropdown`, `populateBankDropdown`, `populateCompanyDropdown`) and upgraded `makeSearchable()` combobox supporting substring and word-prefix search.
  - **Normalized Entity Fetchers (`api.js`)**: Safe, unified API loaders (`fetchProducts`, `fetchCustomers`, `fetchSuppliers`, `fetchWarehouses`, `fetchCategories`, `fetchBankAccounts`, `fetchCompanies`) that normalize varied backend payloads.
  - **Accounting Formatters (`formatters.js`)**: Indian Rupee currency (`inr()`), Indian date formats (`fmtDate()`), number formatting, and account masking.
  - **DOM & UI Helpers (`dom.js`)**: XSS sanitization (`escHtml()`), debouncing (`debounce()`), toast alerts (`showToast()`), CSV export (`downloadCSV()`), and print engine (`printContent()`).
  - **Reference Generator (`reference.js`)**: Standardized Indian commercial references for UPI (`UPI/...@okhdfc`), NEFT, IMPS, Cheques, POS Cards, and Cash.
- **Backend Utilities (`src/backend/src/utils/`)**:
  - `tenant.js`: Centralized `getTenantId(req)` supporting SuperAdmin switching.
  - `reference.js`: Centralized `generateAutoReference(mode, category)`.
  - `response.js`: Standardized `sendSuccess()` and `sendError()`.

### 4. Commercial Billing & Sales Invoicing (`inv-invoice.html`)
- **Full Invoicing Lifecycle**: Creation of GST Sales Invoices, Purchase Bills, and Quotations / Estimates.
- **Barcode & SKU Scanning**: Integrated camera and hardware barcode scanner support.
- **Real-Time Tax & Discount Calculations**: Automatic HSN, GST rate (0%, 5%, 12%, 18%, 28%), and itemized discounts.
- **Print & Spreadsheet Export**: 1-click printable tax invoice and spreadsheet preview.

### 5. Inventory & Multi-Godown ERP (`inv-products.html`, `inv-reports.html`)
- **Multi-Godown Tracking**: Multi-warehouse stock tracking, inter-warehouse transfers, and godown capacity monitoring.
- **Stock Movement Ledger**: 11-column enriched movement audit trail with running stock balance, unit costs, and inward/outward valuations.
- **Product Catalog**: SKU, Barcode, HSN code, Reorder level alerts, and Valuation methods (FIFO / Weighted Average).

### 6. Parties & Outstandings Management (`inv-customers.html`, `inv-suppliers.html`, `inv-outstandings.html`)
- **Supplier & Customer Registers**: GSTIN validation, State codes, Credit terms (days), and Credit limits.
- **Outstandings & Aging Dashboard**: Real-time tracking of Accounts Receivable (Customer Lena) and Accounts Payable (Supplier Dena) with overdue aging brackets (0-30, 31-60, 61-90, 90+ days).
- **Party Statements & WhatsApp Reminders**: Double-entry ledger generation with running balances and 1-click bilingual WhatsApp payment reminders.

### 7. Bill-Wise Payments & Khata Bahi (`inv-payments.html`)
- **Bill-Wise Knockoff Allocation**: Settle payments against specific sales invoices or purchase bills with FIFO auto-allocation.
- **Live Remaining Balance**: Dynamic remaining balance preview for bills and parties.
- **Daily Collections / Outflow**: Per-day cashflow monitoring and mode breakdown (UPI, NEFT/RTGS, Cheque, Cash, Net Banking).
- **Section 269ST Compliance**: Automated cash transaction limits (₹2,00,000 threshold) with warning alerts.

### 8. Finance Master — Cash & Multi-Bank Management (`inv-finance.html`)
- **Multiple Bank Accounts**: Register and manage unlimited bank accounts (HDFC, ICICI, SBI, etc.) with IFSC, account numbers, and live balance calculations.
- **Physical Cash Register**: Real-time cash in hand tracking, fast cash receipts, and petty cash expense logging.
- **Contra Fund Transfers**: Double-entry synchronized transfers between Cash and Bank (Deposits, Withdrawals) or between Bank Accounts.
- **Real-Time Money Flow Statement**: Detailed audit log showing who gave money to which account, payment vouchers, UTR references, and running balances.

---

## 🛠️ Quick Start

```bash
# 1. Navigate to backend directory
cd src/backend

# 2. Install dependencies
npm install

# 3. Seed database with core SaaS & realistic retail simulation
npm run seed

# 4. Start local development server
npm run dev
```

Server runs on `http://localhost:5000`. Access the application frontend directly at `http://localhost:5000/index.html`.

---

## ⚡ Demo Credentials

| Role | Email | Password | Scope |
|---|---|---|---|
| **Super Admin** | `admin@platform.com` | `Admin@1234` | Cross-tenant platform administration |
| **Flagship Retail Admin** | `admin@apexretail.in` | `Password@123` | Full enterprise workspace (Apex Retail) |
| **Company Admin (Acme)** | `admin@acme.com` | `Password@123` | Standard tenant workspace (Acme Corp) |
| **Demo User** | `test@example.com` | `Password@123` | Standard inventory user |

---

## 🌐 Application Sitemap

| Route | File | Key Capabilities |
|---|---|---|
| `/index.html` | Secure Gateway | Role switcher, 1-click demo login, JWT token auth |
| `/dashboard.html` | Super Admin Dashboard | Multi-tenant metrics, tenant switcher, MRR tracking |
| `/company-dashboard.html` | Company Hub | Quick access cards, company profile, team management |
| `/inv-dashboard.html` | Inventory Dashboard | Stock KPIs, Retail Trading bills, Liquidity cards, Outside Cash Flow modal |
| `/inv-invoice.html` | Invoicing & Billing | GST Sales Invoices, Purchase Bills, Quotations, Barcode scanner |
| `/inv-products.html` | Product Catalog | SKU management, barcode generator, HSN, Quick Stock adjustments |
| `/inv-customers.html` | Customer Register | Customer directory, GSTIN, credit limits, receivables balance |
| `/inv-suppliers.html` | Supplier Register | Vendor directory, bank details, credit terms, payables balance |
| `/inv-outstandings.html` | Outstandings & Aging | Receivables & Payables aging analysis, overdue alerts |
| `/inv-payments.html` | Payments & Khata | Bill-wise knockoff, FIFO allocation, WhatsApp reminders, Vouchers |
| `/inv-finance.html` | Finance Master | Cash in hand, Multi-Bank accounts, Contra transfers, Money flow |
| `/inv-reports.html` | Reports & Analytics | Stock valuation (FIFO/Avg), 11-col Stock Movement Ledger, party ledgers |

---

## 📚 Complete Documentation

Detailed guides are available in the [`docs/`](docs/) directory:
- [Complete System Documentation](docs/system_documentation.md) — Comprehensive technical architecture, database schemas, and API reference.
- [Comprehensive User & Feature Guide](docs/USER_FEATURE_GUIDE.md) — End-to-end user manual explaining every feature and workflow step-by-step.
- [System Architecture](docs/architecture.md) — Frontend and backend architectural design and utility patterns.
- [API Reference](docs/api.md) — RESTful API endpoints, request/response structures, and query parameters.
- [Database Schema](docs/database.md) — MongoDB collections, Mongoose models, and indexing strategies.
- [RBAC Architecture](docs/rbac.md) — Role-based access control and permission definitions.
- [Subscription & Billing Flow](docs/subscription.md) — Tenant lifecycles and subscription mechanics.
