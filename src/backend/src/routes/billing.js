'use strict';

const { Router } = require('express');
const { listPlans, getSubscription, subscribeToPlan, cancelSubscription, listInvoices, getInvoice } = require('../controllers/billing');
const { authenticate, resolveTenant, authorize } = require('../middlewares/auth');

const router = Router();

// Public plan listing
router.get('/plans', listPlans);

// Tenant-scoped billing routes
router.get('/subscription', authenticate, resolveTenant, authorize('subscription:read'), getSubscription);
router.post('/subscribe', authenticate, resolveTenant, authorize('subscription:manage'), subscribeToPlan);
router.post('/cancel', authenticate, resolveTenant, authorize('subscription:manage'), cancelSubscription);
router.get('/invoices', authenticate, resolveTenant, authorize('billing:read'), listInvoices);
router.get('/invoices/:id', authenticate, resolveTenant, authorize('billing:read'), getInvoice);

module.exports = router;
