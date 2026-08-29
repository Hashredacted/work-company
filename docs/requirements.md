# Requirements

## Product
Industry-agnostic multi-tenant SaaS.

## Users

Super Admin:
- Platform-wide access
- Company management
- Dashboard
- Subscription/billing
- Reports

Company Admin:
- Own company management
- Users
- Roles/RBAC
- Subscription
- Billing

Company User:
- Permission-based access

## Company

Registration:
- Name
- Address
- Email
- Mobile
- GST
- License/registration details

Fields must remain extensible.

## Trial

Every new company gets a 7-day free trial.

Flow:
REGISTERED → TRIAL → ACTIVE → EXPIRED

## Login

Track `last_login_at`.

Show previous login after successful login.

## Dashboard

Super Admin KPIs:
- Total companies
- Active
- Trial
- Trial expiring
- Trial expired
- Subscribed
- Expired
- Suspended
- Outstanding

## Inventory & Trade ERP Requirements

### Catalog & Warehouses
- Multi-warehouse/godown inventory tracking with inter-warehouse transfers.
- Product catalog supporting Barcode, SKU, HSN codes, and GST rates (0%, 5%, 12%, 18%, 28%).
- Reorder point thresholds and low-stock warning banners.

### Commercial Trading & Bill-Wise Payments
- Customer directory (Receivables / Lena) & Supplier directory (Payables / Dena).
- Atomic stock movements linked to automatic sales invoice (`INVOICE`) and purchase bill (`BILL`) creation.
- Bill-wise knockoff matching (`allocatedBills: [{ billId, amount }]`) with FIFO auto-allocation.
- Double-entry Khata Bahi statements with running balances and printable statements.
- Direct WhatsApp payment reminder launcher with customizable templates.
- Section 269ST compliance guard enforcing a ₹2,00,000 cash statutory ceiling.

### Outside Cash Flow & Liquidity Management
- Segregated non-trading cashflow adjustments (`OUTSIDE_INFLOW` and `OUTSIDE_OUTFLOW`) updating store Cash in Hand and Bank/UPI balances.
- Real-time liquidity reporting on dashboard KPIs (`cashBalance`, `bankBalance`, `outsideCashflow`).
- Document-type filtering on vouchers history (`Sales Invoices`, `Purchase Bills`, `Collections In`, `Payments Out`, `Outside Cashflow`, `Opening Balance`).

### Data Persistence
- Scoped seed script operations ensuring user-registered tenants, custom users, and transactions remain permanently persisted in MongoDB Atlas across server reloads.