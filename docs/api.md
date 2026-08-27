# API Reference & Conventions

## General Conventions
- All endpoints accept and return `application/json`.
- Standard response format:
```json
{
  "data": { ... } | [ ... ] | null,
  "message": "Human readable status message",
  "errors": null | { ... }
}
```

---

## 1. Authentication & Profile (`/api/auth`)
- `POST /api/auth/login`: Authenticate with email and password.
- `GET /api/auth/me`: Retrieve current user profile, role, permissions, and tenant.
- `POST /api/auth/forgot-password`: Request a password reset token.
- `POST /api/auth/reset-password`: Set new password with reset token.
- `PATCH /api/auth/change-password`: Change authenticated user password.
- `PATCH /api/auth/profile`: Update user display name.

---

## 2. Company & Tenant Management (`/api/companies`)
- `POST /api/companies/register`: Register new company with 7-day free trial.
- `GET /api/companies`: List all tenant workspaces (Super Admin only).
- `GET /api/companies/me`: Get current tenant profile.
- `PUT /api/companies/me`: Update company details (GSTIN, address, phone).
- `PUT /api/companies/:id/status`: Update tenant lifecycle (`ACTIVE`, `SUSPENDED`, `EXPIRED`).

---

## 3. Team & RBAC Management (`/api/users`, `/api/roles`)
- `GET /api/users`: List team members for current tenant.
- `POST /api/users`: Invite/create team member.
- `PUT /api/users/:id`: Update team member role/status.
- `DELETE /api/users/:id`: Soft-delete team member.
- `GET /api/roles`: List system and custom tenant roles.
- `POST /api/roles`: Create custom role with granular permissions.
- `PUT /api/roles/:id`: Update custom role permissions.
- `DELETE /api/roles/:id`: Delete custom role.

---

## 4. Inventory, Products & Warehouses (`/api/inventory`)
- `GET /api/inventory/products`: List products with search, pagination, category filter.
- `POST /api/inventory/products`: Create new product/SKU.
- `PUT /api/inventory/products/:id`: Update product pricing and thresholds.
- `GET /api/inventory/categories`: List item categories.
- `POST /api/inventory/categories`: Create category.
- `GET /api/inventory/warehouses`: List all godowns/warehouses.
- `POST /api/inventory/warehouses`: Create warehouse.
- `POST /api/inventory/stock-adjust`: Record stock adjustment (`IN`, `OUT`, `TRANSFER`) with credit bill/invoice creation.

---

## 5. Parties — Suppliers & Customers (`/api/inventory`)
- `GET /api/inventory/suppliers`: List vendors with outstanding payables and payment terms.
- `POST /api/inventory/suppliers`: Add vendor with GSTIN, state code, and bank details.
- `PUT /api/inventory/suppliers/:id`: Update vendor profile.
- `GET /api/inventory/customers`: List debtors with outstanding receivables and credit limits.
- `POST /api/inventory/customers`: Add customer with GSTIN, state code, and billing address.
- `PUT /api/inventory/customers/:id`: Update customer profile.

---

## 6. Payments, Bill-Wise Knockoff & Khata Bahi (`/api/inventory/payments`)
- `GET /api/inventory/payments/kpis`: Get total receivables, payables, overdue amounts, and net working capital.
- `GET /api/inventory/payments/outstandings?type=CUSTOMER|SUPPLIER`: Party-wise aging, outstanding dues, and terms.
- `GET /api/inventory/payments/pending-bills?partyType=...&partyId=...`: Get open unpaid bills/invoices with pending balances and overdue days.
- `GET /api/inventory/payments/daily-summary?days=30`: Per-day inflow, outflow, net cashflow, and payment mode breakdown.
- `GET /api/inventory/payments/statement/:partyType/:partyId`: Double-entry Khata Bahi statement with running balances and knockoff tags.
- `GET /api/inventory/payments`: Paginated list of payment vouchers with linked knockoff tags.
- `POST /api/inventory/payments`: Record payment voucher with manual allocations or FIFO auto-knockoff (`allocations: [{ billId, amount }]`).

---

## 7. Reports & Analytics (`/api/inventory/reports`)
- `GET /api/inventory/reports/dashboard-kpis`: Inventory valuation, low-stock count, fast-moving items.
- `GET /api/inventory/reports/valuation`: Stock valuation summary (FIFO & Weighted Average).
- `GET /api/inventory/reports/stock-ledger/:productId`: Chronological stock ledger movement for SKU.
- `GET /api/inventory/reports/expiry-alerts`: Batches nearing expiration within 30/60/90 days.