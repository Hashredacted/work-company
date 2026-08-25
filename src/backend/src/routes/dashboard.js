'use strict';

const { Router } = require('express');
const { getDashboardStats } = require('../controllers/dashboard');
const { authenticate, authorize } = require('../middlewares/auth');

const router = Router();

// GET /api/dashboard/stats — Super Admin Platform KPIs
router.get('/stats', authenticate, authorize('company:read'), getDashboardStats);

module.exports = router;
