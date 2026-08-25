Multi-Tenant SaaS Platform — **no website builder**. Core features: company registration, users/roles (RBAC), subscriptions, billing.

## Roles
- **Super Admin:** platform-wide; manage companies, subscriptions, billing.
- **Company Admin:** tenant-level; manage own profile, users, roles, billing.
- **User:** limited by assigned role.

## Tenant Model
Every record has `tenant_id`. Company = tenant. Strict isolation enforced in DB.

## Authentication
- Email/password login, JWT/session tokens.
- Password hashing, forgot/reset.
- Track `last_login_at`; show previous login on dashboard.

## Company Registration
Fields: name, address, email, phone, GST, license. 7-day free trial → subscription.

## Dashboard (Super Admin)
Show total companies, active, in trial, trial expiring, expired, outstanding, etc.

## RBAC
Model: *User→Role→Permission*. Actions: create/read/update/delete/manage. Company Admin configures roles. Enforce at backend.

## Subscription & Billing
State flow: TRIAL → ACTIVE → EXPIRED. 7-day trial, plans with start/end dates. Billing: invoices, payments, outstanding.

## Core Entities (DB)
Tenant/Company, User, Role, Permission, Plan, Subscription, Invoice, Payment, AuditLog, LoginHistory.
