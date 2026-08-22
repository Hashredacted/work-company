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

## Billing

Track:
- Plans
- Subscriptions
- Invoices
- Payments
- Outstanding
- Due dates

## Important

No website builder/hosting.

Do not assume unspecified business rules.