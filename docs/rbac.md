# RBAC

## Model

User → Role → Permission

## Permission

Permission = `resource + action`

Examples:

company:read
company:update
user:create
user:delete
billing:read
billing:manage

## Rules

- Roles belong to a tenant unless system-level roles are required.
- Users can have one or multiple roles depending on implementation.
- Company Admin manages tenant roles.
- Super Admin has platform-level access.
- Backend is the authority.
- Deny by default.

## Middleware

Authorization should be reusable:

authenticate()
→ resolveTenant()
→ authorize(permission)
→ controller