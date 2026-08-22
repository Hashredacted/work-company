# AI Development Rules

## Project
Multi-tenant SaaS platform.

## Rules

- Read README.md before coding.
- Check relevant docs before modifying a feature.
- Follow existing project structure and conventions.
- Do not invent business rules.
- Ask/flag unclear requirements.
- Prefer small, isolated changes.
- Do not rewrite working code unnecessarily.
- Keep tenant isolation enforced server-side.
- Keep authorization server-side.
- Never expose secrets or credentials.
- Validate all external/user input.
- Use migrations for DB changes.
- Add/update tests for changed behavior.
- Do not modify unrelated files.

## Architecture

Follow:

UI → API → Service → Repository → DB

Keep business logic out of controllers/UI.

## Multi-Tenancy

Every tenant-owned query must be tenant-scoped.

Super Admin may access cross-tenant data.

Never accept `tenant_id` from an untrusted client as the source of authorization.

## RBAC

Authorization flow:

User → Role → Permission → Resource

Frontend permissions are for UX only.
Backend permissions are authoritative.

## Changes

Before implementation:
1. Identify affected modules.
2. Check relevant docs.
3. Make the smallest correct change.
4. Test.
5. Report changed files and tests.

## Do Not

- Hard-code secrets.
- Bypass authorization.
- Disable security checks to make tests pass.
- Create duplicate utilities/components without checking existing code.
- Add dependencies without justification.