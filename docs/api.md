# API Conventions

## REST

Use resource-oriented REST APIs.

Examples:

GET    /api/companies
GET    /api/companies/:id
POST   /api/companies
PATCH  /api/companies/:id

GET    /api/users
POST   /api/users

GET    /api/roles
POST   /api/roles

GET    /api/subscriptions
GET    /api/invoices

## Response

Use consistent:

{
  data,
  message,
  errors
}

## Errors

Use appropriate HTTP status codes.

400 → Validation
401 → Unauthenticated
403 → Forbidden
404 → Not found
409 → Conflict
422 → Business validation
500 → Server error

## Security

- Authenticate protected routes.
- Authorize every protected action.
- Enforce tenant scope server-side.
- Validate request bodies/query params.