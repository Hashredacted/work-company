# Database

## Core Entities

Tenant
User
Role
Permission
RolePermission
UserRole
Plan
Subscription
Invoice
Payment
AuditLog
LoginHistory

## Relationships

Tenant
 ├── Users
 ├── Roles
 ├── Subscriptions
 ├── Invoices
 └── Payments

User
 └── Roles

Role
 └── Permissions

Subscription
 └── Plan

Invoice
 └── Payments

## Rules

- Tenant-owned tables require `tenant_id`.
- Use FK constraints.
- Add indexes for frequent lookup/filter fields.
- Use migrations.
- Store timestamps.
- Never store plaintext passwords.