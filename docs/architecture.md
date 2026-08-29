# Architecture

## Pattern

```
UI (Vanilla HTML/CSS/JS with Component Design & Safe Overlays)
 ↓
API / Router (/api/auth, /api/inventory, /api/companies, /api/billing)
 ↓
Middlewares (Helmet CSP, CORS, SanitizeInput, Authenticate, ResolveTenant, FinancialLimiter)
 ↓
Controllers & Aggregation Pipelines (Reports, Payment, Product, Company)
 ↓
Mongoose Models (Multi-Tenant Schema, Atomic Sequences, Bill-Wise Knockoffs)
 ↓
Database (MongoDB Atlas)
```

## Core Principles

- **Multi-Tenant SaaS Core**: Strict tenant data isolation enforced on every query (`tenantId: req.tenantId`).
- **Data Persistence**: Scoped demo reseeding ensures user-registered companies, members, and custom data remain permanently preserved.
- **Double-Entry Khata Bahi**: Real-time synchronized accounts receivable (Customer Lena) and accounts payable (Supplier Dena).
- **Bill-Wise Settlement Engine**: Individual invoice/bill knockoff with FIFO auto-allocation and partial payment tracking.
- **Liquidity Management**: Segregated Outside Cash Flow (Capital Injections, Owner Drawings, Overheads) updating store cash & bank accounts without distorting commercial trade sales or purchase turnover.
- **Statutory Compliance**: Automated Indian compliance (GSTIN validation, State Codes, HSN codes, and Section 269ST ₹2 Lakh cash statutory limit guards).
- **Role-Based Access Control (RBAC)**: Fine-grained permissions for Super Admin, Company Admin, Managers, and Custom Roles.
- **Security In Depth**: Helmet Content Security Policy, rate limiting, NoSQL operator sanitization, and parameterized ObjectId validation.

## Tenant Model

- **Tenant = Company Workspace**: Provisioned automatically on 7-day trial signup (`register.html`).
- **Super Admin Scope**: Cross-tenant visibility with real-time tenant context switching via `X-Tenant-Id` header and `?tenantId=` query parameters.
- **Company Users**: Strictly isolated to current tenant workspace.

## Database & Indexing

- Compound multi-tenant indexing: `{ tenantId: 1, partyId: 1, paymentDate: -1 }`, `{ tenantId: 1, sku: 1 }`.
- Atomic sequence generation (`Sequence.findOneAndUpdate`) with `{ returnDocument: 'after' }` preventing voucher collision.
- Soft delete patterns (`deletedAt: null`).