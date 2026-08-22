# Architecture

## Pattern

UI
 ↓
API/Controller
 ↓
Service
 ↓
Repository
 ↓
Database

## Core Principles

- Multi-tenant
- Modular
- API-first
- RBAC
- Server-side authorization
- Dependency injection where applicable
- Validation at API boundary
- Centralized error handling
- Logging
- Automated tests

## Tenant Model

Tenant = Company.

Tenant-owned entities use `tenant_id`.

Super Admin = cross-tenant scope.

Company users = current-tenant scope.

## Security

Authentication identifies user.

Authorization determines permission.

Tenant scope determines accessible data.

Never use UI visibility as security.

## Database

Use:
- UUID/consistent primary keys
- Foreign keys
- Indexes
- Timestamps
- Soft delete where appropriate
- DB migrations

Avoid premature optimization.