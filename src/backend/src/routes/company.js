'use strict';

const { Router } = require('express');
const {
  registerCompany,
  getMyCompany,
  updateMyCompany,
  listCompanies,
  getCompanyById,
  updateCompanyStatus,
} = require('../controllers/company');
const { authenticate, resolveTenant, authorize } = require('../middlewares/auth');

const router = Router();

// POST /api/companies/register — Public onboarding with 7-day trial
router.post('/register', registerCompany);

// GET /api/companies/me — Company Admin view own tenant & trial status
router.get('/me', authenticate, authorize('company:read'), getMyCompany);

// PATCH /api/companies/me — Company Admin update own tenant details
router.patch('/me', authenticate, resolveTenant, authorize('company:update'), updateMyCompany);

// GET /api/companies — Super Admin platform-wide company list
router.get('/', authenticate, authorize('company:read'), listCompanies);

// GET /api/companies/:id — Super Admin view single company details
router.get('/:id', authenticate, authorize('company:read'), getCompanyById);

// PATCH /api/companies/:id/status — Super Admin update company lifecycle status
router.patch('/:id/status', authenticate, authorize('company:update'), updateCompanyStatus);

module.exports = router;
