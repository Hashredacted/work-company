# WorkSpace — Multi-Tenant SaaS Platform
### Complete System Documentation

> **Server**: `http://localhost:5000` · **DB**: MongoDB Atlas · **Stack**: Node.js + Express 5 + MongoDB (Mongoose) + Vanilla HTML/CSS/JS

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Directory Structure](#3-directory-structure)
4. [Data Models](#4-data-models)
5. [RBAC — Roles & Permissions](#5-rbac--roles--permissions)
6. [API Reference](#6-api-reference)
7. [Frontend Pages](#7-frontend-pages)
8. [Security Model](#8-security-model)
9. [Tenant Lifecycle](#9-tenant-lifecycle)
10. [Billing & Plans](#10-billing--plans)
11. [Audit System](#11-audit-system)
12. [Demo Accounts](#12-demo-accounts)
13. [Environment Variables](#13-environment-variables)
14. [Running the Project](#14-running-the-project)

---

## 1. System Overview

WorkSpace is a **multi-tenant B2B SaaS platform** that allows multiple companies (tenants) to operate in full isolation on a shared infrastructure. Each company gets its own:
- User pool and team management
- Role-Based Access Control (RBAC) with custom roles
- 7-day free trial with lifecycle transitions (TRIAL → ACTIVE → EXPIRED/SUSPENDED)
- Subscription plan and invoice history
- Audit log and login history

The **Super Admin** is a platform-level operator who can manage all companies, view cross-tenant analytics, and control lifecycle states.

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
│  │ cors()   │  │ /api/auth│  │  auth.js  │            │
│  │ json()   │  │ /api/... │  │  company  │            │
│  │ static() │  │          │  │  billing  │            │
│  └──────────┘  └──────────┘  └───────────┘            │
│                                                         │
│  ┌────────────────────────────────────┐                │
│  │         Auth Middleware            │                │
│  │  authenticate → resolveTenant      │                │
│  │      → authorize('perm:action')   │                │
│  └────────────────────────────────────┘                │
└────────────────────┬───────────────────────────────────┘
                     │  Mongoose ODM
┌────────────────────▼───────────────────────────────────┐
│                  MongoDB Atlas                           │
│  Collections: users, tenants, roles, plans,             │
│  subscriptions, invoices, auditlogs, loginhistories,    │
│  passwordresettokens                                     │
└────────────────────────────────────────────────────────┘
```

**Key Design Decisions:**
- Every DB query for tenant-scoped resources must carry `tenantId` — enforced in controllers.
- Super Admin has `tenantId = null` in DB and JWT payload.
- Permissions use `resource:action` strings (e.g. `billing:manage`).
- JWT tokens expire in 7 days. No refresh token (stateless).

---

## 3. Directory Structure

```
work company/
├── .env                          ← Root env (MONGODB_URI, JWT_SECRET, etc.)
├── docs/
│   └── development.md            ← Agile workflow rules
├── src/
│   ├── backend/
│   │   ├── .env                  ← Backend-specific env (optional)
│   │   ├── package.json
│   │   └── src/
│   │       ├── app.js            ← Express app entry point
│   │       ├── config/
│   │       │   └── db.js         ← MongoDB connection
│   │       ├── controllers/
│   │       │   ├── auth.js       ← Login, me, forgot/reset password, profile
│   │       │   ├── billing.js    ← Plans, subscriptions, invoices
│   │       │   ├── audit.js      ← Audit logs, login history
│   │       │   ├── company.js    ← Tenant CRUD, lifecycle mgmt
│   │       │   ├── dashboard.js  ← Super Admin KPI metrics
│   │       │   ├── role.js       ← Role CRUD + permission mgmt
│   │       │   └── user.js       ← User CRUD + team mgmt
│   │       ├── middlewares/
│   │       │   ├── auth.js       ← authenticate, resolveTenant, authorize
│   │       │   └── error.js      ← Global error handler
│   │       ├── models/
│   │       │   ├── AuditLog.js
│   │       │   ├── Invoice.js
│   │       │   ├── LoginHistory.js
│   │       │   ├── PasswordResetToken.js
│   │       │   ├── Plan.js
│   │       │   ├── Role.js
│   │       │   ├── Subscription.js
│   │       │   ├── Tenant.js
│   │       │   └── User.js
│   │       ├── routes/
│   │       │   ├── auth.js
│   │       │   ├── audit.js
│   │       │   ├── billing.js
│   │       │   ├── company.js
│   │       │   ├── dashboard.js
│   │       │   ├── role.js
│   │       │   └── user.js
│   │       └── scripts/
│   │           └── seed.js       ← DB seeder (plans, roles, demo users)
│   └── frontend/
│       ├── index.html            ← Login page
│       ├── register.html         ← Company registration / trial signup
│       ├── forgot-password.html  ← Request password reset
│       ├── reset-password.html   ← Set new password via token
│       ├── dashboard.html        ← Super Admin dashboard
│       ├── company-dashboard.html← Company Admin dashboard
│       ├── users.html            ← Team & Role management
│       ├── billing.html          ← Subscription plans & invoice history
│       ├── audit.html            ← Audit logs & login history
│       ├── profile.html          ← Personal settings
│       ├── style.css             ← Global design system
│       ├── auth.js               ← Login logic
│       ├── register.js           ← Registration logic
│       ├── dashboard.js          ← Super Admin JS
│       ├── users.js              ← Team management JS
│       ├── billing.js            ← Billing page JS
│       ├── audit.js              ← Audit page JS
│       └── profile.js            ← Profile page JS
```

---

## 4. Data Models

### `Tenant` (Company)
| Field | Type | Notes |
|-------|------|-------|
| `name` | String | Company display name |
| `email` | String | Primary email, unique |
| `phone` | String | Contact phone |
| `address` | String | Business address |
| `gst` | String | GST / tax number |
| `license` | String | Business license number |
| `status` | Enum | `TRIAL` `ACTIVE` `EXPIRED` `SUSPENDED` `CANCELLED` |
| `trialStartedAt` | Date | Trial start timestamp |
| `trialEndsAt` | Date | Trial expiry (7 days from start) |
| `planId` | ObjectId → Plan | Current subscription plan |
| `subscriptionId` | ObjectId → Subscription | Active subscription |

### `User`
| Field | Type | Notes |
|-------|------|-------|
| `tenantId` | ObjectId → Tenant | `null` = Super Admin |
| `name` | String | Display name |
| `email` | String | Unique, lowercased |
| `password` | String | bcrypt hash (rounds=12) |
| `roleId` | ObjectId → Role | Assigned role |
| `lastLoginAt` | Date | Last successful login |
| `isActive` | Boolean | Account active flag |
| `deletedAt` | Date | Soft-delete timestamp |

### `Role`
| Field | Type | Notes |
|-------|------|-------|
| `tenantId` | ObjectId → Tenant | `null` = system role |
| `name` | String | Role identifier |
| `permissions` | `[String]` | Array of `resource:action` strings |
| `isSystemRole` | Boolean | Protected from deletion |
| `deletedAt` | Date | Soft-delete |

### `Plan`
| Field | Type | Notes |
|-------|------|-------|
| `name` | String | Unique slug (`free`, `starter`, `pro`, `enterprise`) |
| `displayName` | String | Human label |
| `price.monthly` | Number | Monthly price in USD |
| `price.yearly` | Number | Yearly price in USD |
| `limits.maxUsers` | Number | `-1` = unlimited |
| `limits.maxStorage` | Number | GB |
| `limits.apiAccess` | Boolean | |
| `limits.auditLogs` | Boolean | |
| `limits.customRoles` | Boolean | |
| `limits.prioritySupport` | Boolean | |
| `features` | `[String]` | Display bullet points |
| `isFree` | Boolean | |
| `sortOrder` | Number | Display order |

### `Subscription`
| Field | Type | Notes |
|-------|------|-------|
| `tenantId` | ObjectId → Tenant | |
| `planId` | ObjectId → Plan | |
| `status` | Enum | `TRIALING` `ACTIVE` `PAST_DUE` `CANCELLED` `EXPIRED` |
| `billingCycle` | Enum | `monthly` `yearly` |
| `currentPeriodStart` | Date | |
| `currentPeriodEnd` | Date | Next renewal date |
| `cancelledAt` | Date | |
| `cancelReason` | String | |
| `autoRenew` | Boolean | |

### `Invoice`
| Field | Type | Notes |
|-------|------|-------|
| `tenantId` | ObjectId → Tenant | |
| `subscriptionId` | ObjectId → Subscription | |
| `invoiceNumber` | String | Unique, e.g. `INV-1234567890-42` |
| `status` | Enum | `DRAFT` `UNPAID` `PAID` `VOID` `UNCOLLECTIBLE` |
| `currency` | String | `USD` |
| `subtotal` | Number | Pre-tax amount |
| `tax` | Number | 18% GST |
| `total` | Number | Final amount |
| `dueDate` | Date | |
| `paidAt` | Date | |
| `lineItems` | Array | `{ description, quantity, unitPrice, amount }` |

### `AuditLog`
| Field | Type | Notes |
|-------|------|-------|
| `tenantId` | ObjectId | `null` for Super Admin actions |
| `userId` | ObjectId → User | Who performed the action |
| `action` | String | e.g. `AUTH_LOGIN`, `USER_CREATE`, `SUBSCRIPTION_CREATED` |
| `resource` | String | `auth`, `user`, `company`, `role`, `subscription` |
| `resourceId` | String | ID of the affected document |
| `details` | Mixed | JSON object with context |
| `ip` | String | Client IP |
| `userAgent` | String | Browser/client string |

### `LoginHistory`
| Field | Type | Notes |
|-------|------|-------|
| `userId` | ObjectId → User | |
| `tenantId` | ObjectId → Tenant | |
| `ip` | String | |
| `userAgent` | String | |
| `loginAt` | Date | |

### `PasswordResetToken`
| Field | Type | Notes |
|-------|------|-------|
| `userId` | ObjectId → User | |
| `token` | String | **SHA-256 hash** of raw token (raw sent to user) |
| `expiresAt` | Date | 1 hour from creation — TTL index deletes automatically |
| `usedAt` | Date | Set when consumed; `null` = unused |

---

## 5. RBAC — Roles & Permissions

### Permission Format
All permissions use `resource:action` notation:

```
company:read    company:create    company:update    company:delete
user:read       user:create       user:update       user:delete
role:read       role:create       role:update       role:delete
billing:read    billing:manage
subscription:read  subscription:manage
audit:read
```

### System Roles (seeded, `isSystemRole: true`, `tenantId: null`)

| Role | Who It's For | Key Permissions |
|------|-------------|-----------------|
| `super_admin` | Platform operator | **All permissions** |
| `company_admin` | Company owner | company r/w, user CRUD, role CRUD, billing:read, subscription:read |
| `manager` | Team manager | company:read, user r/create/update, role:read |
| `billing_manager` | Finance lead | company:read, billing:manage, subscription:manage |
| `hr_manager` | HR | company:read, full user management, role:read |
| `auditor` | Compliance | company:read, user:read, audit:read |
| `viewer` | Read-only observer | company:read, user:read |

### Hierarchy Enforcement (Backend)
- Only one `super_admin` can exist in the system (enforced in seed + user creation).
- Company Admins **cannot** create `super_admin` or `company_admin` roles for users.
- Role assignment validates the caller's own role level before setting a lower role.

### Middleware Chain
```
authenticate → resolveTenant → authorize('permission:name')
```
- `authenticate`: Validates JWT, attaches `req.user`, `req.permissions`, `req.isSuperAdmin`.
- `resolveTenant`: Blocks cross-tenant access (Super Admin bypasses).
- `authorize(perm)`: Checks `req.permissions.includes(perm)` (Super Admin bypasses).

---

## 6. API Reference

All API responses follow this shape:
```json
{ "data": {...} | null, "message": "...", "errors": {...} | null }
```

### 🔐 Auth — `/api/auth`
| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|-----------|-------------|
| POST | `/login` | ❌ | — | Sign in, returns JWT + user info |
| GET | `/me` | ✅ | — | Get current user + role + permissions |
| POST | `/forgot-password` | ❌ | — | Request reset link (returns URL in demo mode) |
| POST | `/reset-password` | ❌ | — | Set new password with valid token |
| PATCH | `/change-password` | ✅ | — | Change own password (requires current) |
| PATCH | `/profile` | ✅ | — | Update own display name |

### 🏢 Companies — `/api/companies`
| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|-----------|-------------|
| POST | `/register` | ❌ | — | Register new company (starts 7-day trial) |
| GET | `/` | ✅ SA | — | List all tenants (Super Admin) |
| GET | `/me` | ✅ | `company:read` | Get own tenant profile |
| PUT | `/me` | ✅ | `company:update` | Update own company profile |
| PUT | `/:id/status` | ✅ SA | — | Change tenant lifecycle status |
| DELETE | `/:id` | ✅ SA | — | Soft-delete a tenant |

### 📊 Dashboard — `/api/dashboard`
| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|-----------|-------------|
| GET | `/metrics` | ✅ SA | — | KPI counts: total, active, trial, expired, suspended, revenue |

### 👤 Users — `/api/users`
| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|-----------|-------------|
| GET | `/` | ✅ | `user:read` | List team members (tenant-scoped) |
| POST | `/` | ✅ | `user:create` | Invite new team member |
| PUT | `/:id` | ✅ | `user:update` | Update user name/role/status |
| DELETE | `/:id` | ✅ | `user:delete` | Soft-delete user |

### 🛡️ Roles — `/api/roles`
| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|-----------|-------------|
| GET | `/` | ✅ | `role:read` | List all roles (system + tenant custom) |
| POST | `/` | ✅ | `role:create` | Create custom role with permissions |
| PUT | `/:id` | ✅ | `role:update` | Update role permissions |
| DELETE | `/:id` | ✅ | `role:delete` | Delete custom role (system roles protected) |

### 💳 Billing — `/api/billing`
| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|-----------|-------------|
| GET | `/plans` | ❌ | — | List all active pricing plans |
| GET | `/subscription` | ✅ | `subscription:read` | Get current subscription + plan |
| POST | `/subscribe` | ✅ | `subscription:manage` | Subscribe to a plan (simulated, auto PAID invoice) |
| POST | `/cancel` | ✅ | `subscription:manage` | Cancel active subscription |
| GET | `/invoices` | ✅ | `billing:read` | List invoices (paginated) |
| GET | `/invoices/:id` | ✅ | `billing:read` | Get single invoice detail |

### 🔍 Audit — `/api/audit`
| Method | Endpoint | Auth | Permission | Description |
|--------|----------|------|-----------|-------------|
| GET | `/logs` | ✅ | `audit:read` | Audit activity log (filterable by action/resource/user/date) |
| GET | `/login-history` | ✅ | `audit:read` | Team login history |

---

## 7. Frontend Pages

| File | URL | Access | Description |
|------|-----|--------|-------------|
| `index.html` | `/` | Public | Login page with quick-fill demo accounts |
| `register.html` | `/register.html` | Public | Company registration / start free trial |
| `forgot-password.html` | `/forgot-password.html` | Public | Request password reset link |
| `reset-password.html` | `/reset-password.html?token=...` | Public | Set new password |
| `dashboard.html` | `/dashboard.html` | Super Admin | KPI metrics, company table, lifecycle controls |
| `company-dashboard.html` | `/company-dashboard.html` | Company Admin/User | Trial banner, KPI cards, company profile, nav |
| `users.html` | `/users.html` | `user:read` | Team members table + invite modal + custom roles |
| `billing.html` | `/billing.html` | `subscription:read` | Plan cards, subscription status, invoice table |
| `audit.html` | `/audit.html` | `audit:read` | Activity log + login history with filters |
| `profile.html` | `/profile.html` | Authenticated | Edit name, change password, view permissions |

### Navigation Available from Each Dashboard

**Company Dashboard** → Team 👥 · Billing 💳 · Audit 🔍 · Profile 👤 · Sign Out

**Super Admin Dashboard** → Team 👥 · Billing 💳 · Audit 🔍 · Profile 👤 · Sign Out

---

## 8. Security Model

### Authentication
- JWT Bearer tokens: `Authorization: Bearer <token>`
- Token payload: `{ userId, tenantId, iat, exp }`
- Expiry: 7 days (configurable via `JWT_EXPIRES_IN`)
- Password hashing: bcrypt with 12 salt rounds
- Passwords are **never returned** in API responses (`toJSON` strips `password`)

### Multi-Tenant Isolation
- Every tenant-scoped query appends `{ tenantId: req.tenantId }` filter
- `resolveTenant` middleware blocks cross-tenant requests at the HTTP layer
- Super Admin has `tenantId: null` — bypasses all tenant filters
- Soft-deletes used for users and roles (`deletedAt: Date | null`)

### Password Reset Security
- Raw token: 32 random bytes → hex string (sent to user)
- Stored token: SHA-256 hash of raw token (never stored in plain)
- Expiry: 1 hour (MongoDB TTL index auto-deletes)
- One-time use: `usedAt` is set on first use, subsequent requests rejected
- User enumeration prevented: always returns HTTP 200 regardless of email existence

### Role Hierarchy Enforcement
- Backend prevents `super_admin` creation via API (only 1 allowed, created by seed)
- Company Admins cannot assign `super_admin` or `company_admin` roles to users
- System roles (`isSystemRole: true`) cannot be deleted or edited via API

---

## 9. Tenant Lifecycle

```
  Company Registers
        │
        ▼
    ┌───────┐
    │ TRIAL │  ← 7-day free trial, all features unlocked
    └───┬───┘
        │ Subscribes to plan
        ▼
    ┌────────┐
    │ ACTIVE │  ← Full paying subscriber
    └───┬────┘
        │ Trial expires without subscribing
        ▼
    ┌─────────┐
    │ EXPIRED │  ← Access restricted, warned to subscribe
    └─────────┘
        │ Admin suspends manually
        ▼
    ┌───────────┐
    │ SUSPENDED │  ← Full lockout, contact support
    └───────────┘
        │ Admin cancels
        ▼
    ┌───────────┐
    │ CANCELLED │  ← Soft-deleted from active roster
    └───────────┘
```

**Notification Banners** (company-dashboard):
- ≤ 2 days left on trial → yellow "⏳ Trial Ending Soon!" banner with Upgrade CTA
- Trial expired → red "🚫 Trial Expired" banner with Choose Plan CTA
- Suspended → red "🔒 Account Suspended" banner

---

## 10. Billing & Plans

### Pricing Tiers

| Plan | Monthly | Yearly | Users | Storage | API | Audit | Custom Roles |
|------|---------|--------|-------|---------|-----|-------|-------------|
| **Free** | $0 | $0 | 3 | 1 GB | ❌ | ❌ | ❌ |
| **Starter** | $29 | $290 | 10 | 10 GB | ❌ | ✅ | ✅ |
| **Pro** | $79 | $790 | 50 | 50 GB | ✅ | ✅ | ✅ |
| **Enterprise** | $199 | $1,990 | ∞ | 500 GB | ✅ | ✅ | ✅ |

- Yearly = ~17% discount (`monthly × 10`)
- Tax: 18% GST applied automatically on invoices
- Payment gateway: **Simulated** (no real Stripe/Razorpay) — invoice marked PAID instantly
- Cancellation: Subscription cancelled at end of current period

### Invoice Flow
```
POST /api/billing/subscribe
  → Cancel existing subscription (if any)
  → Create new Subscription document
  → Generate Invoice (auto-PAID in demo mode)
  → Update Tenant.planId + Tenant.subscriptionId
  → Transition Tenant.status → ACTIVE
  → Create AuditLog entry
```

---

## 11. Audit System

### Tracked Actions

| Action | Trigger |
|--------|---------|
| `AUTH_LOGIN` | Successful login |
| `AUTH_PASSWORD_RESET` | Password reset via token |
| `AUTH_PASSWORD_CHANGED` | Change password (authenticated) |
| `USER_CREATE` | New user invited |
| `USER_UPDATE` | User profile/role changed |
| `USER_DELETE` | User soft-deleted |
| `ROLE_CREATE` | Custom role created |
| `ROLE_UPDATE` | Role permissions changed |
| `ROLE_DELETE` | Role deleted |
| `COMPANY_REGISTERED` | New tenant signed up |
| `STATUS_CHANGE` | Tenant lifecycle status changed |
| `SUBSCRIPTION_CREATED` | Tenant subscribed to plan |
| `SUBSCRIPTION_CANCELLED` | Subscription cancelled |

### Filtering (GET /api/audit/logs)
```
?action=AUTH_LOGIN     → filter by action substring
?resource=user         → filter by resource type
?userId=<id>           → filter by user
?from=2024-01-01       → date range start
?to=2024-12-31         → date range end
?page=1&limit=50       → pagination
```

---

## 12. Demo Accounts

Seeded via `npm run seed`. **All passwords remain the same after seed runs.**

| Role | Email | Password | Dashboard | Access Level |
|------|-------|----------|-----------|-------------|
| **Super Admin** | `admin@platform.com` | `Admin@1234` | `/dashboard.html` | Full platform control |
| **Company Admin** (Acme — Trial) | `admin@acme.com` | `Password@123` | `/company-dashboard.html` | Acme company management |
| **Team Member** (Acme) | `user@acme.com` | `Password@123` | `/company-dashboard.html` | Read-only team access |
| **Company Admin** (Nexus — Active) | `admin@nexus.com` | `Password@123` | `/company-dashboard.html` | Nexus company management |

> **Quick-fill**: The login page has ⚡ Quick-Fill Demo Role buttons that auto-fill credentials.

---

## 13. Environment Variables

Located at: `work company/.env` (root level)

| Variable | Example | Required | Description |
|----------|---------|----------|-------------|
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/saas_platform` | ✅ | MongoDB connection string |
| `JWT_SECRET` | `your-secret-key-here` | ✅ | JWT signing secret (min 32 chars recommended) |
| `JWT_EXPIRES_IN` | `7d` | ❌ | Token lifetime (default: `7d`) |
| `PORT` | `5000` | ❌ | Server port (default: `5000`) |
| `SUPER_ADMIN_EMAIL` | `admin@platform.com` | ❌ | Seed: super admin email |
| `SUPER_ADMIN_PASSWORD` | `Admin@1234` | ❌ | Seed: super admin password |
| `SUPER_ADMIN_NAME` | `Super Admin` | ❌ | Seed: super admin display name |

---

## 14. Running the Project

### First-time Setup
```bash
# From: work company/src/backend/
npm install

# Seed the database (plans, roles, demo accounts)
npm run seed
```

### Start Development Server
```bash
# From: work company/src/backend/
npm run dev
# → Starts nodemon on http://localhost:5000
# → Frontend served from src/frontend/ as static files
```

### Re-seed (safe — skips existing records)
```bash
npm run seed
```

### Available npm Scripts
| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `nodemon src/app.js` | Development server with hot-reload |
| `npm start` | `node src/app.js` | Production server |
| `npm run seed` | `node src/scripts/seed.js` | Seed plans, roles, demo users |

---

## Quick Reference Card

```
LOGIN          →  POST /api/auth/login
GET ME         →  GET  /api/auth/me
FORGOT PW      →  POST /api/auth/forgot-password
RESET PW       →  POST /api/auth/reset-password
CHANGE PW      →  PATCH /api/auth/change-password

LIST COMPANIES →  GET  /api/companies           (SA only)
MY COMPANY     →  GET  /api/companies/me
REGISTER       →  POST /api/companies/register

LIST USERS     →  GET  /api/users
INVITE USER    →  POST /api/users
UPDATE USER    →  PUT  /api/users/:id

LIST ROLES     →  GET  /api/roles
CREATE ROLE    →  POST /api/roles

PLANS          →  GET  /api/billing/plans
SUBSCRIBE      →  POST /api/billing/subscribe
CANCEL         →  POST /api/billing/cancel
INVOICES       →  GET  /api/billing/invoices

AUDIT LOGS     →  GET  /api/audit/logs
LOGIN HISTORY  →  GET  /api/audit/login-history

DASHBOARD KPIs →  GET  /api/dashboard/metrics
```

---

*Generated: 2026-08-25 | WorkSpace Multi-Tenant SaaS Platform v1.0*
