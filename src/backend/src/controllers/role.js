'use strict';

const { z } = require('zod');
const Role = require('../models/Role');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

// ─── Available System Permissions ────────────────────────────────────────────
const AVAILABLE_PERMISSIONS = [
  { resource: 'company', action: 'read', description: 'View company profile and settings' },
  { resource: 'company', action: 'update', description: 'Edit company profile and settings' },
  { resource: 'user', action: 'read', description: 'View team members' },
  { resource: 'user', action: 'create', description: 'Add / add new team members' },
  { resource: 'user', action: 'update', description: 'Edit team members and assign roles' },
  { resource: 'user', action: 'delete', description: 'Deactivate / remove team members' },
  { resource: 'role', action: 'read', description: 'View roles and permission sets' },
  { resource: 'role', action: 'create', description: 'Create custom roles' },
  { resource: 'role', action: 'update', description: 'Edit custom roles and permissions' },
  { resource: 'role', action: 'delete', description: 'Delete custom roles' },
  { resource: 'billing', action: 'read', description: 'View billing, invoices, and payment history' },
  { resource: 'billing', action: 'manage', description: 'Manage subscriptions and payment methods' },
  { resource: 'subscription', action: 'read', description: 'View subscription status and plan info' },
  { resource: 'subscription', action: 'manage', description: 'Upgrade, downgrade, or cancel subscription' },
  { resource: 'audit', action: 'read', description: 'View audit activity and login history' },
  { resource: 'inventory', action: 'read', description: 'View products, stock levels, and inventory catalogs' },
  { resource: 'inventory', action: 'manage', description: 'Create and update products, categories, suppliers, customers, and warehouses' },
  { resource: 'inventory', action: 'orders', description: 'Create and process Purchase Orders, Sales Orders, and Goods Receipts (GRN)' },
  { resource: 'inventory', action: 'approve', description: 'Approve physical stock audits and adjustments' },
  { resource: 'inventory', action: 'reports', description: 'Access valuation, stock ledger, GST tax summary, and expiry reports' },
  { resource: 'inventory', action: 'admin', description: 'Full inventory management module administration' },
];

const createRoleSchema = z.object({
  name: z.string().min(2, 'Role name must be at least 2 characters'),
  permissions: z.array(z.string()).min(1, 'At least one permission must be assigned'),
});

const updateRoleSchema = z.object({
  name: z.string().min(2).optional(),
  permissions: z.array(z.string()).min(1).optional(),
});

// ─── GET /api/roles/permissions ──────────────────────────────────────────────
// Returns all available system permission definitions

function getAvailablePermissions(_req, res) {
  return res.status(200).json({
    data: AVAILABLE_PERMISSIONS,
    message: 'Available permissions retrieved',
    errors: null,
  });
}

// ─── GET /api/roles ──────────────────────────────────────────────────────────
// Returns system template roles + tenant custom roles

async function listRoles(req, res, next) {
  try {
    let query = {};
    if (req.isSuperAdmin) {
      // Super Admin sees all system roles + tenant roles
      query = { deletedAt: null };
    } else {
      // Company Admin sees system default templates + own tenant roles
      query = {
        deletedAt: null,
        $or: [
          { isSystemRole: true },
          { tenantId: req.tenantId },
        ],
      };
    }

    const roles = await Role.find(query).sort({ isSystemRole: -1, createdAt: 1 }).lean();

    return res.status(200).json({
      data: roles,
      message: 'Roles retrieved successfully',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/roles ─────────────────────────────────────────────────────────
// Creates a new custom role for the current tenant

async function createRole(req, res, next) {
  try {
    if (!req.tenantId && !req.isSuperAdmin) {
      return res.status(400).json({
        data: null,
        message: 'Tenant context required to create a role',
        errors: null,
      });
    }

    const parsed = createRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        data: null,
        message: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { name, permissions } = parsed.data;

    // Check if role name already exists in this tenant
    const existing = await Role.findOne({
      tenantId: req.tenantId,
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      deletedAt: null,
    });

    if (existing) {
      return res.status(409).json({
        data: null,
        message: 'A role with this name already exists in your workspace',
        errors: { name: ['Role name already exists'] },
      });
    }

    const role = await Role.create({
      tenantId: req.tenantId || null,
      name,
      permissions,
      isSystemRole: false,
    });

    await AuditLog.create({
      tenantId: req.tenantId || null,
      userId: req.user._id,
      action: 'ROLE_CREATE',
      resource: 'role',
      resourceId: role._id.toString(),
      details: { name: role.name, permissions: role.permissions },
      ip: req.ip,
      userAgent: req.headers ? req.headers['user-agent'] : null,
    });

    return res.status(201).json({
      data: role,
      message: 'Role created successfully',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/roles/:id ────────────────────────────────────────────────────
// Updates a custom role

async function updateRole(req, res, next) {
  try {
    const parsed = updateRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        data: null,
        message: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const role = await Role.findById(req.params.id);
    if (!role || role.deletedAt) {
      return res.status(404).json({ data: null, message: 'Role not found', errors: null });
    }

    // System roles cannot be modified
    if (role.isSystemRole) {
      return res.status(403).json({
        data: null,
        message: 'System default template roles cannot be modified',
        errors: null,
      });
    }

    // Tenant isolation check
    if (!req.isSuperAdmin && String(role.tenantId) !== String(req.tenantId)) {
      return res.status(403).json({
        data: null,
        message: 'Forbidden: Access denied to other tenant roles',
        errors: null,
      });
    }

    if (parsed.data.name) role.name = parsed.data.name;
    if (parsed.data.permissions) role.permissions = parsed.data.permissions;

    await role.save();

    await AuditLog.create({
      tenantId: req.tenantId || null,
      userId: req.user._id,
      action: 'ROLE_UPDATE',
      resource: 'role',
      resourceId: role._id.toString(),
      details: { name: role.name, permissions: role.permissions },
      ip: req.ip,
      userAgent: req.headers ? req.headers['user-agent'] : null,
    });

    return res.status(200).json({
      data: role,
      message: 'Role updated successfully',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/roles/:id ───────────────────────────────────────────────────
// Soft-deletes a custom role (only if no users assigned)

async function deleteRole(req, res, next) {
  try {
    const role = await Role.findById(req.params.id);
    if (!role || role.deletedAt) {
      return res.status(404).json({ data: null, message: 'Role not found', errors: null });
    }

    if (role.isSystemRole) {
      return res.status(403).json({
        data: null,
        message: 'System default template roles cannot be deleted',
        errors: null,
      });
    }

    if (!req.isSuperAdmin && String(role.tenantId) !== String(req.tenantId)) {
      return res.status(403).json({
        data: null,
        message: 'Forbidden: Access denied to other tenant roles',
        errors: null,
      });
    }

    // Check if any active users currently have this role
    const assignedUserCount = await User.countDocuments({ roleId: role._id, deletedAt: null });
    if (assignedUserCount > 0) {
      return res.status(409).json({
        data: null,
        message: `Cannot delete role: ${assignedUserCount} user(s) currently have this role assigned. Reassign them first.`,
        errors: null,
      });
    }

    role.deletedAt = new Date();
    await role.save();

    await AuditLog.create({
      tenantId: req.tenantId || null,
      userId: req.user._id,
      action: 'ROLE_DELETE',
      resource: 'role',
      resourceId: role._id.toString(),
      details: { name: role.name },
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    });

    return res.status(200).json({
      data: null,
      message: 'Role deleted successfully',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAvailablePermissions,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
};
