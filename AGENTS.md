## Project Overview
Multi-tenant SaaS app. Agent tasks use this fixed context:
- **Roles & Auth:** Use RBAC model, token auth.
- **Entities:** Company, User, Role, Permission, Subscription, Invoice, etc.
- **Features:** Auth/login, company management, roles, billing.
- **Data Security:** Always apply `tenant_id` filter on queries.

## Workflow
1. **Plan** tasks using static rules/schemas (cacheable).
2. **Load Context:** On each task, load only relevant schema and docs (lazy-load).
3. **Implementation:** Write minimal code per task; use existing services/libraries.
4. **Validation:** Test with example inputs and verify tenant isolation.

## Agent Rules
- **Minimal Prompt:** Include only needed info per request (no full docs).  
- **Reuse Context:** Put stable info (schemas, libraries) at prompt start for caching.  
- **Safety:** Don’t expose secrets or PII. Validate inputs.  
- **Iterations:** Each task: plan → implement → test → revise.

## Development
- **Branching:** Work in small increments (feature branches).  
- **Tests:** Add unit tests for new behavior; CI should catch regressions.  
- **Tools:** Use migrations for DB changes; linting & formatting per style.  
