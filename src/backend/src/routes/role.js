'use strict';

const { Router } = require('express');
const {
  getAvailablePermissions,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
} = require('../controllers/role');
const { authenticate, resolveTenant, authorize } = require('../middlewares/auth');

const router = Router();

// GET /api/roles/permissions — Publicly available metadata list of system permissions
router.get('/permissions', authenticate, getAvailablePermissions);

// GET /api/roles — List roles visible to tenant
router.get('/', authenticate, resolveTenant, authorize('role:read'), listRoles);

// POST /api/roles — Create custom role
router.post('/', authenticate, resolveTenant, authorize('role:create'), createRole);

// PATCH /api/roles/:id — Update custom role
router.patch('/:id', authenticate, resolveTenant, authorize('role:update'), updateRole);

// DELETE /api/roles/:id — Delete custom role
router.delete('/:id', authenticate, resolveTenant, authorize('role:delete'), deleteRole);

module.exports = router;
