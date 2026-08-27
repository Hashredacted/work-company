# WorkSpace — Multi-Tenant SaaS & Inventory ERP Platform

WorkSpace is a multi-tenant B2B SaaS platform combined with an Inventory & Double-Entry Payment Khata ERP designed for Indian enterprises.

---

## 🚀 Key Features

### 1. Multi-Tenant SaaS Core
- **Company Registration & 7-Day Free Trial**: Automatic trial management (`TRIAL` $\rightarrow$ `ACTIVE` $\rightarrow$ `EXPIRED` $\rightarrow$ `SUSPENDED`).
- **Role-Based Access Control (RBAC)**: Granular permissions for Super Admin, Company Admin, Managers, and Custom Roles.
- **Tenant Data Isolation**: Database queries strictly isolated using tenant IDs.
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
- **Section 269ST Compliance**: Automated cash transaction limits and warning banners.

---

## 🛠️ Quick Start

```bash
# 1. Navigate to backend directory
cd src/backend

# 2. Install dependencies
npm install

# 3. Seed database with core SaaS & 7 realistic payment scenarios
npm run seed
node src/scripts/seed_payment_cases.js

# 4. Start local development server
npm run dev
```

Server runs on `http://localhost:5000`. Access the frontend directly at `http://localhost:5000/index.html`.

---

## ⚡ Demo Credentials

| Role | Email | Password |
|---|---|---|
| **Super Admin** | `admin@platform.com` | `Admin@1234` |
| **Company Admin** (Acme) | `admin@acme.com` | `Password@123` |
| **Team Member** (Acme) | `user@acme.com` | `Password@123` |

---

## 📚 Documentation

Detailed documentation is available in the [`docs/`](docs/) directory:
- [System Documentation](docs/system_documentation.md)
- [API Reference](docs/api.md)
- [Database Schema](docs/database.md)
- [RBAC Architecture](docs/rbac.md)
- [Subscription & Billing Flow](docs/subscription.md)
