'use strict';

const { Router } = require('express');
const { login, me, forgotPassword, resetPassword, changePassword, updateProfile } = require('../controllers/auth');
const { authenticate } = require('../middlewares/auth');

const router = Router();

router.post('/login', login);
router.get('/me', authenticate, me);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.patch('/change-password', authenticate, changePassword);
router.patch('/profile', authenticate, updateProfile);

module.exports = router;

