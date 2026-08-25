'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Role = require('../models/Role');

// ─── Helpers ────────────────────────────────────────────────────────────────

function sendError(res, status, message) {
  return res.status(status).json({ data: null, message, errors: null });
}

// ─── authenticate ────────────────────────────────────────────────────────────
// Verifies JWT and attaches req.user + req.role (with permissions)

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return sendError(res, 401, 'Authentication required');
    }

    const token = header.split(' ')[1];
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return sendError(res, 401, 'Invalid or expired token');
    }

    const user = await User.findById(payload.userId).lean();
    if (!user || !user.isActive || user.deletedAt) {
      return sendError(res, 401, 'User not found or inactive');
    }

    const role = user.roleId
      ? await Role.findById(user.roleId).lean()
      : null;

    req.user = user;
    req.tenantId = user.tenantId || null;   // null = Super Admin
    req.permissions = role ? role.permissions : [];
    req.isSuperAdmin = user.tenantId === null;

    next();
  } catch (err) {
    next(err);
  }
}

// ─── resolveTenant ───────────────────────────────────────────────────────────
// Guards cross-tenant access. Super Admin bypasses.
// Pass tenantId via route param (:tenantId) or req.tenantId.

function resolveTenant(req, res, next) {
  if (req.isSuperAdmin) return next(); // Super Admin sees all

  const requestedTenant =
    req.params.tenantId || req.query.tenantId || String(req.tenantId);

  if (!req.tenantId) {
    return sendError(res, 403, 'Tenant context missing');
  }

  if (requestedTenant && requestedTenant !== String(req.tenantId)) {
    return sendError(res, 403, 'Access denied: cross-tenant access not allowed');
  }

  next();
}

// ─── authorize ───────────────────────────────────────────────────────────────
// Usage: router.get('/...', authenticate, authorize('company:read'), controller)

function authorize(permission) {
  return (req, res, next) => {
    if (req.isSuperAdmin) return next(); // Super Admin bypasses

    if (!req.permissions.includes(permission)) {
      return sendError(res, 403, `Forbidden: missing permission "${permission}"`);
    }
    next();
  };
}

module.exports = { authenticate, resolveTenant, authorize };
