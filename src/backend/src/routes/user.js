'use strict';

const { Router } = require('express');
const {
  listUsers,
  createUser,
  getUserById,
  updateUser,
  deleteUser,
} = require('../controllers/user');
const { authenticate, resolveTenant, authorize } = require('../middlewares/auth');

const router = Router();

// GET /api/users — List tenant users
router.get('/', authenticate, resolveTenant, authorize('user:read'), listUsers);

// POST /api/users — Create / Invite team member
router.post('/', authenticate, resolveTenant, authorize('user:create'), createUser);

// GET /api/users/:id — View single user
router.get('/:id', authenticate, resolveTenant, authorize('user:read'), getUserById);

// PATCH /api/users/:id — Update user or reassign role
router.patch('/:id', authenticate, resolveTenant, authorize('user:update'), updateUser);

// DELETE /api/users/:id — Soft-delete user
router.delete('/:id', authenticate, resolveTenant, authorize('user:delete'), deleteUser);

module.exports = router;
