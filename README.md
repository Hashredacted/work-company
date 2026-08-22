# Multi-Tenant SaaS Platform

## Goal
Build an industry-agnostic **multi-tenant SaaS platform** for companies to register, manage users/RBAC, subscriptions and billing.

No website builder/hosting.

## Roles

### Super Admin
Platform-level full access:
- Manage all companies/tenants
- Dashboard/KPIs
- Subscriptions
- Billing/outstanding
- Company/user status
- Reports

### Company Admin
Tenant-level admin:
- Company profile
- Users
- Roles/permissions
- Subscription
- Billing

### Company User
Access controlled by RBAC.

## Multi-Tenancy

Architecture:

Super Admin → Tenants → Users/Roles/Data

Every tenant-owned record must contain `tenant_id` / `company_id`.

**Strict tenant isolation is mandatory.**

Never trust frontend checks for tenant security.

## Authentication

Implement:
- Login/logout
- Password hashing
- Forgot/reset password
- Session/token auth
- Account status
- Last login

Store `last_login_at` and display previous login after authentication.

## Company Registration

Initial fields:
- Company name
- Address
- Email
- Mobile
- GST
- License/registration details

Keep company fields extensible for different industries.

Flow:

Register → Company → 7-Day Trial → Subscription

## Super Admin Dashboard

Show:
- Total companies
- Active companies
- Trial companies
- Trials expiring soon
- Trial expired
- Subscribed companies
- Expired subscriptions
- Suspended companies
- Total outstanding
- Recent registrations/subscriptions

Provide search, filters and company details.

## RBAC

Model:

User → Role → Permission

Use action-based permissions:
`Create | Read | Update | Delete | Manage`

Company Admin can create roles and assign permissions.

Do not hard-code authorization into UI.

## Subscription

Lifecycle:

`TRIAL → ACTIVE → EXPIRED`

Support:
- 7-day trial
- Plans
- Start/end dates
- Status
- Renewal

Keep subscription and billing logic separate.

## Billing

Company:
- Plan
- Invoices
- Payments
- Outstanding
- Due dates
- Payment history

Super Admin:
- Total billing
- Paid
- Outstanding
- Overdue
- Subscription status

## Core Entities

Tenant/Company  
User  
Role  
Permission  
Plan  
Subscription  
Invoice  
Payment  
AuditLog  
LoginHistory

Use migrations, FK constraints and indexes.

## Security

- Secure password hashing
- Auth middleware
- RBAC middleware
- Server-side authorization
- Tenant isolation
- Input validation
- Secure sessions/tokens
- Audit logging

## Agile MVP

### Sprint 1
Auth + Company Registration + Trial

### Sprint 2
Super Admin Dashboard + Company Management

### Sprint 3
Users + Roles + RBAC

### Sprint 4
Subscription + Billing

### Sprint 5
Reports + Audit Logs + Security Hardening

## MVP Flow

Super Admin Login
→ Dashboard
→ Company Registration
→ 7-Day Trial
→ Company Admin Login
→ Users/RBAC
→ Subscription
→ Billing

## Development Rules

- Industry-agnostic core
- Multi-tenant by design
- RBAC from day one
- Secure backend authorization
- No invented business rules
- Keep uncertain requirements configurable
- Build/test in small Agile increments