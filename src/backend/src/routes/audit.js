'use strict';

const { Router } = require('express');
const { listAuditLogs, listLoginHistory } = require('../controllers/audit');
const { authenticate, resolveTenant, authorize } = require('../middlewares/auth');

const router = Router();

router.get('/logs', authenticate, resolveTenant, authorize('audit:read'), listAuditLogs);
router.get('/login-history', authenticate, resolveTenant, authorize('audit:read'), listLoginHistory);

module.exports = router;
