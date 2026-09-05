# System Architecture

## Overview

```
Browser Client (Vanilla HTML5 / CSS3 / Vanilla JS)
 ├── Modular Utility Suite (AppUtils / app-utils.js)
 │    ├── Universal Dropdown Engine (dropdown.js + SearchableSelect)
 │    ├── Normalized Entity Fetchers (api.js)
 │    ├── Formatters & Currency Engine (formatters.js)
 │    ├── DOM, XSS Sanitization & UI Helpers (dom.js)
 │    ├── Commercial Reference Generator (reference.js)
 │    └── Auth & Tenant Session Guard (auth.js)
 ├── Shared Navigation Controller (sidebar.js)
 └── Universal Spreadsheet Viewer & Print Engine (spreadsheet-viewer.js)
       ↓  HTTP / REST (JSON) with Bearer Token & X-Tenant-Id
Express 5 Application Server (src/backend/src/app.js)
 ├── Security & Rate Limiting (Helmet CSP, CORS, SanitizeInput, FinancialLimiter)
 ├── Auth & Multi-Tenancy Middleware (authenticate, resolveTenant, authorize, validateObjectId)
 ├── Backend Utility Layer (src/backend/src/utils/)
 │    ├── Centralized Tenant Resolution (tenant.js)
 │    ├── Commercial Reference Generator (reference.js)
 │    ├── Standardized JSON Responders (response.js)
 │    ├── Encryption & Masking (encryption.js)
 │    └── Atomic Sequence Counters (sequence.js)
 ├── Controllers & Aggregation Pipelines (payment.js, finance.js, adjustment.js, reports.js, product.js)
 └── Mongoose ODM Models (Multi-Tenant Schema with Compound Indexes)
       ↓
Database (MongoDB Atlas / MongoDB 7+)
```

---

## 1. Frontend Architecture & Modular Utility Suite

The frontend is built using standard Vanilla JavaScript and Vanilla CSS without external framework overhead, ensuring high performance, zero build-step requirements, and maintainability.

### A. Consolidated App Utilities (`src/frontend/js/utils/` & `app-utils.js`)
All pages link `<script src="../js/app-utils.js"></script>`, which bundles six specialized modules into `window.AppUtils` while providing backward-compatible global shortcuts:

1. **Universal Dropdown Engine (`dropdown.js`)**:
   - Standardized entity populators: `populateProductDropdown()`, `populatePartyDropdown()`, `populateWarehouseDropdown()`, `populateCategoryDropdown()`, `populateBankDropdown()`, and `populateCompanyDropdown()`.
   - Enhanced `SearchableSelect` (`makeSearchable()`):
     - Uses `smartSearchMatch` to support both word-prefix and substring/numeric searches (e.g. matching middle of SKU or price).
     - Employs a `MutationObserver` to automatically resynchronize whenever `<select>` options are loaded or modified asynchronously.
     - Preserves nested `<optgroup>` groupings and category hierarchy icons.
2. **Normalized Entity Loaders (`api.js`)**:
   - Centralizes `getApiBase()` (auto-detecting `http://localhost:5000/api` for local dev vs `/api` for production) and `getHeaders()` / `H()` (injecting `Authorization: Bearer <token>` and `X-Tenant-Id`).
   - Normalizes varied API response structures:
     - `fetchProducts()`: Safely extracts products whether wrapped in `{ data: { products } }` or `{ data }`.
     - `fetchCustomers()` & `fetchSuppliers()`: Extracts items and deduplicates by ID.
     - `fetchWarehouses()`, `fetchCategories()`, `fetchBankAccounts()`, and `fetchCompanies()`.
3. **Accounting Formatters (`formatters.js`)**:
   - `inr(val)` / `formatINR(val)`: Standard Indian Rupee currency format (`₹1,23,456.00` or `-₹500.00`).
   - `fmtDate(d)` / `formatDate(d)`: Standard Indian date format (`03 Sep 2026`).
   - `formatNumber(val, decimals)`: Indian numeric grouping.
   - `formatMasked(str, visibleEnd)`: Bank account and card masking (`•••• 1234`).
4. **DOM & UI Helpers (`dom.js`)**:
   - `escHtml(str)` / `escapeHtml(str)`: Entity escaping preventing XSS vulnerabilities.
   - `debounce(fn, delay)`: High-performance input debouncing for search bars.
   - `showToast(msg, type)`: Animated notifications (success, error, warning, info).
   - `downloadCSV(filename, rows, headers)`: Universal client-side spreadsheet export.
   - `printContent(title, html)`: Standalone print window generation.
5. **Commercial Reference Generator (`reference.js`)**:
   - Unified `generateSmartRef(mode, category)` producing realistic references for UPI (`UPI/...@okhdfc`), NEFT (`HDFCN...`), IMPS, Cheques, POS Cards, Cash receipts, and Contra bank transfer slips.
6. **Auth & Context Guard (`auth.js`)**:
   - `authGuard()`, `getCurrentUser()`, `getCurrentTenantId()`, and `signOut()`.

### B. Shared Navigation Controller (`sidebar.js`)
All 9 inventory pages share a standardized vertical navigation sidebar controlled by `sidebar.js`:
- **Split-Pill Quick Create Button**: Primary link for Sales Invoices plus an interactive flyout menu for 1-click creation of Sales Invoices, Purchase Bills, Quotations, Payments, and Items.
- **Role-Based System Navigation Footer**: Resolves the `#main-nav-link` destination dynamically:
  - Super Admin $\rightarrow$ `dashboard.html` (Platform Overview & Tenant Switcher).
  - Tenant Admin / User $\rightarrow$ `company-dashboard.html` (Company Workspace Hub).
- **Accordion State Persistence**: Automatically expands the active navigation group (`Parties`, `Items`, `Sales`, `Purchases`, `Reports`) matching the current URL and parameters.
- **Trust Badges**: Persistent 100% Secure and ISO Certified indicators.

---

## 2. Backend Utility Layer (`src/backend/src/utils/`)

Backend business logic is consolidated into reusable utility modules:

1. **Tenant Resolution (`src/backend/src/utils/tenant.js`)**:
   - `getTenantId(req)`: Extracts the active tenant ID from `req.tenantId`, request query (`?tenantId=`), or header (`X-Tenant-Id`). Supports cross-tenant switching for Super Admins while enforcing strict isolation for standard users. Validates Mongoose `ObjectId` casting.
   - `tenantFilter(req)`: Generates query filter `{ tenantId: <ObjectId> }`.
2. **Commercial Reference Engine (`src/backend/src/utils/reference.js`)**:
   - `generateAutoReference(mode, category)`: Centralizes random reference generation for all payment modes across `finance.js`, `payment.js`, and `adjustment.js`.
3. **Standard Response Helper (`src/backend/src/utils/response.js`)**:
   - `sendSuccess(res, data, message, statusCode)` and `sendError(res, message, errors, statusCode)` ensuring consistent JSON payloads across controllers.
4. **Sequence & Encryption (`sequence.js`, `encryption.js`)**:
   - Atomic sequence counter generation (`nextSeq`) preventing voucher number collisions.
   - AES-256 encryption and masking for sensitive financial data.

---

## 3. Core Principles & Data Security

1. **Multi-Tenant Data Isolation**:
   - Every database query in inventory and payment controllers strictly applies the `tenantId` filter.
   - Cross-tenant data leakage is prevented at both the route middleware (`resolveTenant`) and controller query layers.
2. **Persistent Data Guarantee**:
   - System seeders (`npm run seed`) scope demo resets specifically to the demo retail company (`admin@apexretail.in`), ensuring user-created companies and custom transactions are 100% preserved.
3. **Double-Entry Khata Bahi Synchronization**:
   - Real-time synchronized accounts receivable (Customer Lena) and accounts payable (Supplier Dena).
   - Invoices, purchase bills, and payment receipts automatically update party outstanding balances and running stock ledgers.
4. **Statutory Compliance**:
   - GSTIN format validation and state code extraction.
   - Automated Income Tax Act Section 269ST enforcement blocking single-day cash transactions $\ge ₹2,00,000$.