'use strict';

const Tenant = require('../models/Tenant');
const User = require('../models/User');

// ─── GET /api/dashboard/stats ────────────────────────────────────────────────
// Aggregates real-time KPIs for Super Admin

async function getDashboardStats(req, res, next) {
  try {
    if (!req.isSuperAdmin) {
      return res.status(403).json({
        data: null,
        message: 'Forbidden: Super Admin access required',
        errors: null,
      });
    }

    const now = new Date();
    const fortyEightHoursFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const [
      totalCompanies,
      activeCompanies,
      subscribedCompanies,
      trialCompanies,
      trialExpiringCompanies,
      trialExpiredCompanies,
      suspendedCompanies,
      cancelledCompanies,
      totalUsers,
      recentCompanies,
    ] = await Promise.all([
      // Total count
      Tenant.countDocuments(),

      // Active
      Tenant.countDocuments({ status: 'ACTIVE' }),

      // Subscribed / Active paid
      Tenant.countDocuments({ status: 'ACTIVE' }),

      // Trial total
      Tenant.countDocuments({ status: 'TRIAL' }),

      // Trial expiring within next 48h (where trialEndsAt is between now and +48h)
      Tenant.countDocuments({
        status: 'TRIAL',
        trialEndsAt: { $gte: now, $lte: fortyEightHoursFromNow },
      }),

      // Trial already expired (status is TRIAL but trialEndsAt < now) or status EXPIRED
      Tenant.countDocuments({
        $or: [
          { status: 'EXPIRED' },
          { status: 'TRIAL', trialEndsAt: { $lt: now } },
        ],
      }),

      // Suspended
      Tenant.countDocuments({ status: 'SUSPENDED' }),

      // Cancelled
      Tenant.countDocuments({ status: 'CANCELLED' }),

      // Total users across platform
      User.countDocuments({ deletedAt: null }),

      // Last 5 registered companies
      Tenant.find().sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    return res.status(200).json({
      data: {
        kpis: {
          totalCompanies,
          activeCompanies,
          subscribedCompanies,
          trialCompanies,
          trialExpiringCompanies,
          trialExpiredCompanies,
          suspendedCompanies,
          cancelledCompanies,
          totalUsers,
        },
        recentCompanies,
      },
      message: 'Dashboard metrics retrieved successfully',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboardStats };
