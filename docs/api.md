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
- `GET /api/inventory/payments/kpis`: Get total receivables, payables, overdue amounts, and net working capital. Supports `X-Tenant-Id` header and `?tenantId=`.
- `GET /api/inventory/payments/outstandings?type=CUSTOMER|SUPPLIER`: Party-wise aging, outstanding dues, and terms.
- `GET /api/inventory/payments/pending-bills?partyType=...&partyId=...`: Get open unpaid bills/invoices with pending balances and overdue days.
- `GET /api/inventory/payments/daily-summary?days=30`: Per-day inflow, outflow, net cashflow, and payment mode breakdown (including trade collections and outside cash flows).
- `GET /api/inventory/payments/statement/:partyType/:partyId`: Double-entry Khata Bahi statement with running balances and knockoff tags.
- `GET /api/inventory/payments/voucher/:voucherNoOrId`: Detailed view of individual invoice, bill, payment voucher, or outside adjustment with line items and settlement history.
- `GET /api/inventory/payments?txnType=...&partyType=...&paymentMode=...&search=...&page=1&limit=100`: Paginated list of vouchers with multi-type filters (`INVOICE`, `BILL`, `PAYMENT_IN`, `PAYMENT_OUT`, `OUTSIDE`, `OUTSIDE_INFLOW`, `OUTSIDE_OUTFLOW`, `OPENING_BAL`) and category counts.
- `POST /api/inventory/payments`: Record commercial payment voucher against customer/supplier with manual allocations or FIFO auto-knockoff (`allocations: [{ billId, amount }]`).
- `POST /api/inventory/payments/outside-cashflow`: Record non-trading cash flow adjustment to add to (+ Inflow) or subtract from (- Outflow) Cash in Hand or Bank/UPI balance:
```json
{
  "direction": "ADD" | "SUBTRACT",
  "amount": 50000,
  "paymentMode": "CASH" | "UPI" | "NEFT_RTGS" | "CHEQUE" | "NET_BANKING" | "CARD",
  "category": "CAPITAL_INJECTION" | "OWNER_DRAWINGS" | "RENT_AND_UTILITIES" | "SALARY_AND_WAGES" | "OFFICE_EXPENSES" | "LOAN_RECEIVED" | "LOAN_REPAYMENT" | "BANK_CHARGES_TAX" | "OTHER_INFLOW" | "OTHER_OUTFLOW",
  "partyName": "Store Owner / Landlord / Bank",
  "referenceNo": "UPI/12345678",
  "notes": "August Store Rent",
  "paymentDate": "2026-08-29T12:00:00.000Z"
}
```
- `PUT /api/inventory/payments/initial-working-capital`: Set or adjust company baseline initial working capital.
```json
{
  "amount": 500000,
  "alsoInjectToAccounts": false,
  "accountMode": "CASH" | "UPI" | "NEFT_RTGS" | "CHEQUE",
  "notes": "Initial Seed Capital Fund"
}
```

---

## 7. Reports & Analytics (`/api/inventory/reports`)
- `GET /api/inventory/reports/dashboard-kpis`: Executive trading and liquidity overview. Returns:
  - `total`: `{ items, suppliers, customers }`
  - `outstanding`: `{ suppliers: { payed, due }, customers: { recieved, due } }`
  - `retail`: `{ sales: { bills, totalAmount }, purchased: { bills, totalAmount } }` (Pure commercial trading turnover)
  - `account`: `{ cashBalance, bankBalance, cashIn, cashOut, bankIn, bankOut, outsideCashflow: { inflow, outflow, net } }`
  - `stockValue`: Total inventory valuation in INR.
  - `lowStockProducts`: Deficit count.
  - `overdueAlerts`: Critical overdue invoices and bills.
- `GET /api/inventory/reports/valuation`: Stock valuation summary (FIFO & Weighted Average).
- `GET /api/inventory/reports/stock-ledger/:productId`: Chronological stock ledger movement for SKU.
- `GET /api/inventory/reports/expiry-alerts`: Batches nearing expiration within 30/60/90 days.