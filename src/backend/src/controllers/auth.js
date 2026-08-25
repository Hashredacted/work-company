'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { z } = require('zod');
const User = require('../models/User');
const Role = require('../models/Role');
const LoginHistory = require('../models/LoginHistory');
const AuditLog = require('../models/AuditLog');
const PasswordResetToken = require('../models/PasswordResetToken');

// ─── Validation Schemas ───────────────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

// ─── Helper: sign JWT ────────────────────────────────────────────────────────

function signToken(user) {
  return jwt.sign(
    { userId: user._id, tenantId: user.tenantId || null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ─── POST /api/auth/login ────────────────────────────────────────────────────

async function login(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        data: null,
        message: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const { email, password } = parsed.data;

    const user = await User.findOne({ email, isActive: true, deletedAt: null });
    if (!user) {
      return res.status(401).json({ data: null, message: 'Invalid email or password', errors: null });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ data: null, message: 'Invalid email or password', errors: null });
    }

    const lastRecord = await LoginHistory.findOne({ userId: user._id })
      .sort({ loginAt: -1 })
      .lean();
    const previousLoginAt = lastRecord ? lastRecord.loginAt : null;

    await Promise.all([
      LoginHistory.create({
        userId:    user._id,
        tenantId:  user.tenantId || null,
        ip:        req.ip,
        userAgent: req.headers['user-agent'] || null,
        loginAt:   new Date(),
      }),
      AuditLog.create({
        tenantId:  user.tenantId || null,
        userId:    user._id,
        action:    'AUTH_LOGIN',
        resource:  'auth',
        resourceId: user._id.toString(),
        details:   { email: user.email },
        ip:        req.ip,
        userAgent: req.headers['user-agent'] || null,
      }),
    ]);

    await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });

    const role = user.roleId ? await Role.findById(user.roleId).lean() : null;
    const token = signToken(user);

    return res.status(200).json({
      data: {
        token,
        user: {
          id:          user._id,
          name:        user.name,
          email:       user.email,
          tenantId:    user.tenantId,
          isSuperAdmin: !user.tenantId,
          role:        role ? { id: role._id, name: role.name, permissions: role.permissions } : null,
          lastLoginAt: new Date(),
        },
        previousLoginAt,
      },
      message: 'Login successful',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/auth/me ────────────────────────────────────────────────────────

async function me(req, res, next) {
  try {
    const role = req.user.roleId
      ? await Role.findById(req.user.roleId).lean()
      : null;

    return res.status(200).json({
      data: {
        user: {
          id:           req.user._id,
          name:         req.user.name,
          email:        req.user.email,
          tenantId:     req.user.tenantId,
          lastLoginAt:  req.user.lastLoginAt,
          isSuperAdmin: req.isSuperAdmin,
          role: role
            ? { id: role._id, name: role.name, permissions: role.permissions }
            : null,
        },
      },
      message: 'OK',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/forgot-password ─────────────────────────────────────────

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ data: null, message: 'Email is required', errors: null });
    }

    const user = await User.findOne({ email: email.toLowerCase(), deletedAt: null });

    // Always return 200 to prevent user enumeration
    if (!user) {
      return res.status(200).json({ data: null, message: 'If that email exists, a reset link has been sent.', errors: null });
    }

    // Invalidate any existing tokens for this user
    await PasswordResetToken.deleteMany({ userId: user._id });

    // Create new token (1 hour expiry)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await PasswordResetToken.create({ userId: user._id, token: hashedToken, expiresAt });

    // In production this would be emailed. For demo, we log it.
    const resetUrl = `http://localhost:5000/reset-password.html?token=${rawToken}`;
    console.log(`\n[Password Reset] Token for ${user.email}:\n  URL: ${resetUrl}\n  Raw Token: ${rawToken}\n`);

    return res.status(200).json({
      data: { resetUrl }, // Returned for demo/testing purposes only
      message: 'If that email exists, a reset link has been sent.',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/auth/reset-password ───────────────────────────────────────────

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ data: null, message: 'Token and new password are required', errors: null });
    }
    if (password.length < 6) {
      return res.status(400).json({ data: null, message: 'Password must be at least 6 characters', errors: null });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const record = await PasswordResetToken.findOne({
      token: hashedToken,
      expiresAt: { $gt: new Date() },
      usedAt: null,
    });

    if (!record) {
      return res.status(400).json({ data: null, message: 'Invalid or expired reset token', errors: null });
    }

    const user = await User.findById(record.userId);
    if (!user) {
      return res.status(404).json({ data: null, message: 'User not found', errors: null });
    }

    user.password = password;
    await user.save();

    record.usedAt = new Date();
    await record.save();

    await AuditLog.create({
      tenantId:  user.tenantId || null,
      userId:    user._id,
      action:    'AUTH_PASSWORD_RESET',
      resource:  'auth',
      resourceId: user._id.toString(),
      details:   { email: user.email },
      ip:        req.ip,
      userAgent: req.headers ? req.headers['user-agent'] : null,
    });

    return res.status(200).json({ data: null, message: 'Password reset successfully. You can now sign in.', errors: null });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/auth/change-password ─────────────────────────────────────────

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ data: null, message: 'Current and new passwords are required', errors: null });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ data: null, message: 'New password must be at least 6 characters', errors: null });
    }

    const user = await User.findById(req.user._id);
    const valid = await user.comparePassword(currentPassword);
    if (!valid) {
      return res.status(401).json({ data: null, message: 'Current password is incorrect', errors: null });
    }

    user.password = newPassword;
    await user.save();

    await AuditLog.create({
      tenantId:  user.tenantId || null,
      userId:    user._id,
      action:    'AUTH_PASSWORD_CHANGED',
      resource:  'auth',
      resourceId: user._id.toString(),
      details:   { email: user.email },
      ip:        req.ip,
      userAgent: req.headers ? req.headers['user-agent'] : null,
    });

    return res.status(200).json({ data: null, message: 'Password changed successfully', errors: null });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/auth/profile ──────────────────────────────────────────────────

async function updateProfile(req, res, next) {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ data: null, message: 'Name must be at least 2 characters', errors: null });
    }

    await User.findByIdAndUpdate(req.user._id, { name: name.trim() });

    return res.status(200).json({ data: { name: name.trim() }, message: 'Profile updated successfully', errors: null });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, me, forgotPassword, resetPassword, changePassword, updateProfile };
