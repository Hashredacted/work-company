'use strict';

const { z } = require('zod');
const User = require('../models/User');
const Role = require('../models/Role');
const AuditLog = require('../models/AuditLog');

const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  roleId: z.string().min(1, 'Role must be selected'),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  roleId: z.string().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

// ─── GET /api/users ──────────────────────────────────────────────────────────
// List users within the current tenant (or all for Super Admin)

async function listUsers(req, res, next) {
  try {
    const { search, roleId, status, page = 1, limit = 50 } = req.query;

    const query = { deletedAt: null };

    // Tenant Isolation
    if (!req.isSuperAdmin) {
      query.tenantId = req.tenantId;
    } else if (req.query.tenantId) {
      query.tenantId = req.query.tenantId;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (roleId) query.roleId = roleId;
    if (status !== undefined && status !== '') query.isActive = status === 'true' || status === 'active';

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .populate('roleId', 'name permissions isSystemRole')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      User.countDocuments(query),
    ]);

    return res.status(200).json({
      data: {
        users,
        pagination: {
          total,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          totalPages: Math.ceil(total / parseInt(limit, 10)),
        },
      },
      message: 'Users retrieved successfully',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/users ─────────────────────────────────────────────────────────
// Add / Create user in the current tenant

async function createUser(req, res, next) {
  try {
    if (!req.tenantId && !req.isSuperAdmin) {
      return res.status(400).json({
        data: null,
        message: 'Tenant context required to create a user',
        errors: null,
      });
    }

    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        data: null,
        message: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { name, email, password, roleId } = parsed.data;

    // Check if email is already taken
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({
        data: null,
        message: 'A user with this email already exists',
        errors: { email: ['Email is already in use'] },
      });
    }

    // Verify role exists and is accessible to this tenant
    const role = await Role.findById(roleId);
    if (!role || role.deletedAt) {
      return res.status(404).json({
        data: null,
        message: 'Selected role not found',
        errors: { roleId: ['Invalid role'] },
      });
    }

    // 1. Block creating Super Admin (only 1 can exist platform-wide)
    if (role.name === 'super_admin') {
      return res.status(403).json({
        data: null,
        message: 'Forbidden: Cannot create Super Admin accounts. Only one platform Super Admin is permitted.',
        errors: null,
      });
    }

    // 2. Block Company Admins from creating another Company Admin (only lower/custom roles allowed)
    if (!req.isSuperAdmin && role.name === 'company_admin') {
      return res.status(403).json({
        data: null,
        message: 'Forbidden: Company Admins cannot create another Admin. You can only assign lower custom roles.',
        errors: null,
      });
    }

    // Tenant check on role (must belong to this tenant or be a tenant-accessible role)
    if (!role.isSystemRole && !req.isSuperAdmin && String(role.tenantId) !== String(req.tenantId)) {
      return res.status(403).json({
        data: null,
        message: 'Selected role does not belong to your workspace',
        errors: null,
      });
    }

    const user = await User.create({
      tenantId: req.tenantId || null,
      name,
      email: email.toLowerCase(),
      password,
      roleId: role._id,
      isActive: true,
    });

    await AuditLog.create({
      tenantId: req.tenantId || null,
      userId: req.user._id,
      action: 'USER_CREATE',
      resource: 'user',
      resourceId: user._id.toString(),
      details: { name: user.name, email: user.email, role: role.name },
      ip: req.ip,
      userAgent: req.headers ? req.headers['user-agent'] : null,
    });

    const populated = await User.findById(user._id)
      .select('-password')
      .populate('roleId', 'name permissions isSystemRole')
      .lean();

    return res.status(201).json({
      data: populated,
      message: 'User created successfully',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/users/:id ──────────────────────────────────────────────────────
// View single user details

async function getUserById(req, res, next) {
  try {
    const user = await User.findOne({ _id: req.params.id, deletedAt: null })
      .select('-password')
      .populate('roleId', 'name permissions isSystemRole')
      .lean();

    if (!user) {
      return res.status(404).json({ data: null, message: 'User not found', errors: null });
    }

    // Tenant isolation check
    if (!req.isSuperAdmin && String(user.tenantId) !== String(req.tenantId)) {
      return res.status(403).json({
        data: null,
        message: 'Forbidden: Access denied to other tenant users',
        errors: null,
      });
    }

    return res.status(200).json({
      data: user,
      message: 'User details retrieved',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/users/:id ────────────────────────────────────────────────────
// Update user details or reassign role

async function updateUser(req, res, next) {
  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        data: null,
        message: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const user = await User.findOne({ _id: req.params.id, deletedAt: null });
    if (!user) {
      return res.status(404).json({ data: null, message: 'User not found', errors: null });
    }

    // Tenant isolation check
    if (!req.isSuperAdmin && String(user.tenantId) !== String(req.tenantId)) {
      return res.status(403).json({
        data: null,
        message: 'Forbidden: Access denied to other tenant users',
        errors: null,
      });
    }

    if (parsed.data.name) user.name = parsed.data.name;
    if (parsed.data.isActive !== undefined) user.isActive = parsed.data.isActive;
    if (parsed.data.password) user.password = parsed.data.password; // pre-save hook will hash it

    if (parsed.data.roleId) {
      const role = await Role.findById(parsed.data.roleId);
      if (!role || role.deletedAt) {
        return res.status(404).json({ data: null, message: 'Role not found', errors: null });
      }
      if (role.name === 'super_admin') {
        return res.status(403).json({ data: null, message: 'Forbidden: Cannot promote user to Super Admin', errors: null });
      }
      if (!req.isSuperAdmin && role.name === 'company_admin') {
        return res.status(403).json({ data: null, message: 'Forbidden: Company Admins cannot promote users to Admin. Only lower roles are permitted.', errors: null });
      }
      if (!role.isSystemRole && !req.isSuperAdmin && String(role.tenantId) !== String(req.tenantId)) {
        return res.status(403).json({ data: null, message: 'Role does not belong to your workspace', errors: null });
      }
      user.roleId = role._id;
    }

    await user.save();

    await AuditLog.create({
      tenantId: req.tenantId || null,
      userId: req.user._id,
      action: 'USER_UPDATE',
      resource: 'user',
      resourceId: user._id.toString(),
      details: { name: user.name, isActive: user.isActive },
      ip: req.ip,
      userAgent: req.headers ? req.headers['user-agent'] : null,
    });

    const updated = await User.findById(user._id)
      .select('-password')
      .populate('roleId', 'name permissions isSystemRole')
      .lean();

    return res.status(200).json({
      data: updated,
      message: 'User updated successfully',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/users/:id ───────────────────────────────────────────────────
// Soft delete a user

async function deleteUser(req, res, next) {
  try {
    const user = await User.findOne({ _id: req.params.id, deletedAt: null });
    if (!user) {
      return res.status(404).json({ data: null, message: 'User not found', errors: null });
    }

    if (!req.isSuperAdmin && String(user.tenantId) !== String(req.tenantId)) {
      return res.status(403).json({
        data: null,
        message: 'Forbidden: Access denied to other tenant users',
        errors: null,
      });
    }

    // Prevent user from deleting their own account via this endpoint
    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({
        data: null,
        message: 'Cannot delete your own user account',
        errors: null,
      });
    }

    user.deletedAt = new Date();
    user.isActive = false;
    await user.save();

    await AuditLog.create({
      tenantId: req.tenantId || null,
      userId: req.user._id,
      action: 'USER_DELETE',
      resource: 'user',
      resourceId: user._id.toString(),
      details: { email: user.email },
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
    });

    return res.status(200).json({
      data: null,
      message: 'User removed successfully',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUsers,
  createUser,
  getUserById,
  updateUser,
  deleteUser,
};
