'use strict';

const jwt = require('jsonwebtoken');
const { z } = require('zod');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Role = require('../models/Role');
const LoginHistory = require('../models/LoginHistory');
const AuditLog = require('../models/AuditLog');

// ─── Validation Schemas ──────────────────────────────────────────────────────

const registerCompanySchema = z.object({
  // Company fields
  name:     z.string().min(2, 'Company name must be at least 2 characters'),
  email:    z.string().email('Invalid company email'),
  phone:    z.string().optional(),
  address:  z.string().optional(),
  gst:      z.string().optional(),
  license:  z.string().optional(),

  // Initial Admin User fields
  adminName:     z.string().min(2, 'Admin name must be at least 2 characters'),
  adminEmail:    z.string().email('Invalid admin email'),
  adminPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

const updateCompanySchema = z.object({
  name:     z.string().min(2).optional(),
  phone:    z.string().optional(),
  address:  z.string().optional(),
  gst:      z.string().optional(),
  license:  z.string().optional(),
});

// ─── Helper: sign JWT ────────────────────────────────────────────────────────
function signToken(user) {
  return jwt.sign(
    { userId: user._id, tenantId: user.tenantId || null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ─── POST /api/companies/register ────────────────────────────────────────────
// Public: Registers a new Company, creates 7-Day Trial, provisions Company Admin

async function registerCompany(req, res, next) {
  try {
    const parsed = registerCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        data: null,
        message: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const {
      name, email, phone, address, gst, license,
      adminName, adminEmail, adminPassword,
    } = parsed.data;

    // Check if company email or admin email already exists
    const [existingCompany, existingUser] = await Promise.all([
      Tenant.findOne({ email: email.toLowerCase() }),
      User.findOne({ email: adminEmail.toLowerCase() }),
    ]);

    if (existingCompany) {
      return res.status(409).json({
        data: null,
        message: 'A company with this email already exists',
        errors: { email: ['Company email is already registered'] },
      });
    }

    if (existingUser) {
      return res.status(409).json({
        data: null,
        message: 'A user with this admin email already exists',
        errors: { adminEmail: ['Admin email is already registered'] },
      });
    }

    // Resolve default company_admin system role
    const companyAdminRole = await Role.findOne({ name: 'company_admin', isSystemRole: true });
    if (!companyAdminRole) {
      return res.status(500).json({
        data: null,
        message: 'Default company_admin role not found. Please run seed script first.',
        errors: null,
      });
    }

    // Set 7-day trial dates
    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 1. Create Tenant
    const tenant = await Tenant.create({
      name,
      email: email.toLowerCase(),
      phone: phone || '',
      address: address || '',
      gst: gst || '',
      license: license || '',
      status: 'TRIAL',
      trialStartedAt,
      trialEndsAt,
    });

    // 2. Create Company Admin User linked to Tenant
    const user = await User.create({
      tenantId: tenant._id,
      name: adminName,
      email: adminEmail.toLowerCase(),
      password: adminPassword,
      roleId: companyAdminRole._id,
      isActive: true,
      lastLoginAt: new Date(),
    });

    // 3. Record initial LoginHistory & AuditLog & Provision default Inventory (Warehouse & Category)
    const Warehouse = require('../models/inv/Warehouse');
    const InvCategory = require('../models/inv/Category');
    const codePrefix = (name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4) || 'WH').toUpperCase();

    await Promise.all([
      LoginHistory.create({
        userId: user._id,
        tenantId: tenant._id,
        ip: req.ip,
        userAgent: req.headers['user-agent'] || null,
        loginAt: new Date(),
      }),
      AuditLog.create({
        tenantId: tenant._id,
        userId: user._id,
        action: 'COMPANY_REGISTER',
        resource: 'company',
        resourceId: tenant._id.toString(),
        details: { name: tenant.name, email: tenant.email, status: tenant.status },
        ip: req.ip,
        userAgent: req.headers['user-agent'] || null,
      }),
      Warehouse.create({
        tenantId: tenant._id,
        name: 'Main Godown',
        code: `WH-${codePrefix}-01`,
        type: 'OWNED',
        city: address ? address.split(',')[0].trim() : 'Mumbai',
        state: 'Maharashtra',
        stateCode: '27',
        pincode: '400001',
        isDefault: true,
      }),
    ]);

    // Seed Indian Category Presets
    const { seedIndianPresetsForTenant } = require('./inventory/category');
    await seedIndianPresetsForTenant(tenant._id);

    // 4. Sign JWT
    const token = signToken(user);

    return res.status(201).json({
      data: {
        token,
        tenant: {
          id: tenant._id,
          name: tenant.name,
          email: tenant.email,
          phone: tenant.phone,
          address: tenant.address,
          gst: tenant.gst,
          license: tenant.license,
          status: tenant.status,
          trialStartedAt: tenant.trialStartedAt,
          trialEndsAt: tenant.trialEndsAt,
          daysRemainingInTrial: 7,
        },
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: {
            id: companyAdminRole._id,
            name: companyAdminRole.name,
            permissions: companyAdminRole.permissions,
          },
        },
      },
      message: 'Company registered successfully with 7-day free trial',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/companies/me ───────────────────────────────────────────────────
// Protected: Current tenant profile & trial calculations

async function getMyCompany(req, res, next) {
  try {
    if (!req.tenantId) {
      return res.status(400).json({
        data: null,
        message: 'Super Admin does not belong to a specific tenant',
        errors: null,
      });
    }

    const tenant = await Tenant.findById(req.tenantId).lean();
    if (!tenant) {
      return res.status(404).json({ data: null, message: 'Company not found', errors: null });
    }

    // Calculate remaining trial days
    let daysRemainingInTrial = 0;
    if (tenant.status === 'TRIAL' && tenant.trialEndsAt) {
      const now = new Date();
      const diffMs = new Date(tenant.trialEndsAt).getTime() - now.getTime();
      daysRemainingInTrial = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    return res.status(200).json({
      data: {
        ...tenant,
        daysRemainingInTrial,
      },
      message: 'OK',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/companies/me ─────────────────────────────────────────────────
// Protected: Update company profile metadata (Company Admin)

async function updateMyCompany(req, res, next) {
  try {
    if (!req.tenantId) {
      return res.status(400).json({
        data: null,
        message: 'Tenant context required to update company profile',
        errors: null,
      });
    }

    const parsed = updateCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        data: null,
        message: 'Validation failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const updated = await Tenant.findByIdAndUpdate(
      req.tenantId,
      { $set: parsed.data },
      { returnDocument: 'after', runValidators: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ data: null, message: 'Company not found', errors: null });
    }

    return res.status(200).json({
      data: updated,
      message: 'Company profile updated successfully',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/companies ──────────────────────────────────────────────────────
// Protected: Super Admin platform listing with pagination & filters

async function listCompanies(req, res, next) {
  try {
    if (!req.isSuperAdmin) {
      return res.status(403).json({
        data: null,
        message: 'Forbidden: Super Admin access required',
        errors: null,
      });
    }

    const { page = 1, limit = 20, status, search } = req.query;
    const query = {};

    if (status) {
      query.status = status.toUpperCase();
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { gst: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [companies, total] = await Promise.all([
      Tenant.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      Tenant.countDocuments(query),
    ]);

    return res.status(200).json({
      data: {
        companies,
        pagination: {
          total,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          totalPages: Math.ceil(total / parseInt(limit, 10)),
        },
      },
      message: 'OK',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/companies/:id ──────────────────────────────────────────────────
// Protected: Super Admin view single company details & user list

async function getCompanyById(req, res, next) {
  try {
    if (!req.isSuperAdmin) {
      return res.status(403).json({
        data: null,
        message: 'Forbidden: Super Admin access required',
        errors: null,
      });
    }

    const tenant = await Tenant.findById(req.params.id).lean();
    if (!tenant) {
      return res.status(404).json({ data: null, message: 'Company not found', errors: null });
    }

    const [users, userCount] = await Promise.all([
      User.find({ tenantId: tenant._id, deletedAt: null }).select('-password').populate('roleId', 'name permissions').lean(),
      User.countDocuments({ tenantId: tenant._id, deletedAt: null }),
    ]);

    let daysRemainingInTrial = 0;
    if (tenant.status === 'TRIAL' && tenant.trialEndsAt) {
      const now = new Date();
      const diffMs = new Date(tenant.trialEndsAt).getTime() - now.getTime();
      daysRemainingInTrial = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    return res.status(200).json({
      data: {
        ...tenant,
        daysRemainingInTrial,
        userCount,
        users,
      },
      message: 'OK',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/companies/:id/status ─────────────────────────────────────────
// Protected: Super Admin update company lifecycle status

const statusSchema = z.object({
  status: z.enum(['TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED']),
});

async function updateCompanyStatus(req, res, next) {
  try {
    if (!req.isSuperAdmin) {
      return res.status(403).json({
        data: null,
        message: 'Forbidden: Super Admin access required',
        errors: null,
      });
    }

    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        data: null,
        message: 'Invalid status value',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { status } = parsed.data;
    const updated = await Tenant.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { returnDocument: 'after' }
    ).lean();

    if (!updated) {
      return res.status(404).json({ data: null, message: 'Company not found', errors: null });
    }

    return res.status(200).json({
      data: updated,
      message: `Company status updated to ${status}`,
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  registerCompany,
  getMyCompany,
  updateMyCompany,
  listCompanies,
  getCompanyById,
  updateCompanyStatus,
};

