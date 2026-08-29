# WorkSpace — Multi-Tenant SaaS & Inventory ERP Platform

WorkSpace is a multi-tenant B2B SaaS platform combined with an Inventory & Double-Entry Payment Khata ERP designed for Indian enterprises.

---

## 🚀 Key Features

### 1. Multi-Tenant SaaS Core
- **Company Registration & 7-Day Free Trial**: Automatic trial management (`TRIAL` $\rightarrow$ `ACTIVE` $\rightarrow$ `EXPIRED` $\rightarrow$ `SUSPENDED`).
- **Role-Based Access Control (RBAC)**: Granular permissions for Super Admin, Company Admin, Managers, and Custom Roles.
- **Tenant Data Isolation**: Database queries strictly isolated using tenant IDs (`tenantId` filter on every query).
- **Persistent Data Guarantee**: User-registered companies and custom transactions are 100% persisted across server restarts, nodemon reloads, and demo reseeds.
- **Platform Analytics**: Super Admin KPI dashboard tracking revenue, subscriptions, and tenant lifecycles.

### 2. Inventory & Multi-Godown ERP
- **Multi-Warehouse / Godown Tracking**: Godown-specific stock visibility and inter-warehouse stock transfers.
- **Product Catalog**: SKU, Barcode, HSN code, Reorder level alerts, and Valuation methods (FIFO / Weighted Average).
- **Stock Movements**: Atomic Stock In / Stock Out / Transfer vouchers linked to automated billing.

### 3. Parties (Vendors & Customers)
- **Supplier & Customer Registers**: GSTIN validation, State codes, Credit terms (days), and Credit limits.
- **Party Aging Analysis**: Real-time identification of Overdue & Critical debtors.

### 4. Bill-Wise Payments & Khata Bahi (खाता बही)
- **Bill-Wise Knockoff Allocation**: Settle payments against specific sales invoices or purchase bills with FIFO auto-allocation.
- **Live Remaining Balance**: Real-time remaining balance calculations in modal and ledger tables.
- **Daily Collections / Outflow**: Per-day cashflow monitoring and mode breakdown (UPI, NEFT/RTGS, Cheque, Cash, Net Banking).
- **Party Statements**: Double-entry ledger with running balances and printable statements.
- **WhatsApp Payment Reminders**: Direct WhatsApp web integration with bilingual reminder templates.
- **Section 269ST Compliance**: Automated cash transaction limits (₹2,00,000 threshold) and warning banners.

### 5. Outside Cash Flow & Account Balances (Liquidity Management)
- **Outside Cash Flow (Non-Trading Adjustments)**: Add (+ Inflow) or subtract (- Outflow) funds from **Cash in Hand** or **Bank / UPI** without distorting trade sales or purchase ledgers.
- **Supported Non-Trading Categories**: Owner Capital Injections, Owner Drawings, Rent & Utilities, Staff Wages, Office Expenses, Loans In/Out, Bank Charges.
- **Multi-Type Vouchers History**: Filter all commercial documents and vouchers by type (`Sales Invoices`, `Purchase Bills`, `Collections In`, `Payments Out`, `Outside Cashflow`, `Opening Balance`).

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

Server runs on `http://localhost:5000`. Access the frontend directly at `http://localhost:5000/index.html`.

---

## ⚡ Demo Credentials

| Role | Email | Password |
|---|---|---|
| **Super Admin** | `admin@platform.com` | `Admin@1234` |
| **Flagship Retail Admin** | `admin@apexretail.in` | `Password@123` |
| **Company Admin (Acme)** | `admin@acme.com` | `Password@123` |
| **Demo User** | `test@example.com` | `Password@123` |

---

## 📚 Documentation

Detailed documentation is available in the [`docs/`](docs/) directory:
- [Complete System Documentation](docs/system_documentation.md)
- [Comprehensive User & Feature Guide](docs/USER_FEATURE_GUIDE.md)
- [API Reference](docs/api.md)
- [Database Schema](docs/database.md)
- [System Architecture](docs/architecture.md)
- [RBAC Architecture](docs/rbac.md)
- [Subscription & Billing Flow](docs/subscription.md)
