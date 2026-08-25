'use strict';

const AuditLog = require('../models/AuditLog');
const LoginHistory = require('../models/LoginHistory');
const User = require('../models/User');

// ─── GET /api/audit/logs ─────────────────────────────────────────────────────
// List audit logs for tenant (or all for Super Admin)

async function listAuditLogs(req, res, next) {
  try {
    const { page = 1, limit = 50, action, resource, userId, from, to } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const query = {};

    if (!req.isSuperAdmin) {
      query.tenantId = req.tenantId;
    } else if (req.query.tenantId) {
      query.tenantId = req.query.tenantId;
    }

    if (action) query.action = { $regex: action, $options: 'i' };
    if (resource) query.resource = resource;
    if (userId) query.userId = userId;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    return res.status(200).json({
      data: {
        logs,
        pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), totalPages: Math.ceil(total / parseInt(limit, 10)) },
      },
      message: 'Audit logs retrieved',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/audit/login-history ────────────────────────────────────────────
// List login history for tenant

async function listLoginHistory(req, res, next) {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const query = {};
    if (!req.isSuperAdmin) {
      // Find all user IDs in tenant
      const tenantUsers = await User.find({ tenantId: req.tenantId, deletedAt: null }, '_id').lean();
      query.userId = { $in: tenantUsers.map(u => u._id) };
    }

    const [history, total] = await Promise.all([
      LoginHistory.find(query)
        .populate('userId', 'name email')
        .sort({ loginAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      LoginHistory.countDocuments(query),
    ]);

    return res.status(200).json({
      data: {
        history,
        pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), totalPages: Math.ceil(total / parseInt(limit, 10)) },
      },
      message: 'Login history retrieved',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAuditLogs, listLoginHistory };
