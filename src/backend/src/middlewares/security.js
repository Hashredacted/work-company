'use strict';

const mongoose  = require('mongoose');
const rateLimit = require('express-rate-limit');

// ─── Rate Limiters ────────────────────────────────────────────────────────────

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3000, // Limit each IP to 3000 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { data: null, message: 'Too many requests from this IP, please try again after 15 minutes.', errors: null },
});

// Rate limiter for Authentication (Login / Register / Password resets)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 150, // Max 150 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { data: null, message: 'Too many authentication attempts. Please try again after 15 minutes.', errors: null },
});

// Financial / Stock Adjustment rate limiter
const financialLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 150, // Max 150 transactions per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { data: null, message: 'Transaction rate limit exceeded. Please wait a moment before trying again.', errors: null },
});

// ─── In-place NoSQL Injection Sanitizer (Express 5 compatible) ────────────────
function sanitizeInPlace(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    // Drop keys with dangerous MongoDB operators ($gt, $ne, $where, etc.) or dot notation
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
    } else if (typeof obj[key] === 'object') {
      sanitizeInPlace(obj[key]);
    }
  }
}

function sanitizeInput(req, _res, next) {
  if (req.body) sanitizeInPlace(req.body);
  if (req.query) sanitizeInPlace(req.query);
  if (req.params) sanitizeInPlace(req.params);
  next();
}

// ─── Validate ObjectId Route Parameters ───────────────────────────────────────
function validateObjectId(...paramNames) {
  return (req, res, next) => {
    for (const name of paramNames) {
      const val = req.params[name] || req.query[name];
      if (val && !mongoose.Types.ObjectId.isValid(val)) {
        return res.status(400).json({
          data: null,
          message: `Invalid ID format for parameter: '${name}'`,
          errors: null,
        });
      }
    }
    next();
  };
}

// ─── Indian Section 269ST Cash Limit Validator (Max ₹2,00,000 in single Cash txn)
const MAX_CASH_LIMIT_INR = 200000;

function validateCashLimit(req, res, next) {
  const { paymentMode, amount, paidAmount } = req.body;
  const cashAmount = paymentMode === 'CASH' ? Number(amount || paidAmount || 0) : 0;

  if (cashAmount > MAX_CASH_LIMIT_INR) {
    return res.status(400).json({
      data: null,
      message: `Cash transaction exceeds the statutory limit of ₹2,00,000 (Section 269ST). Please use UPI, NEFT/RTGS, or Cheque for amounts above ₹2 Lakhs.`,
      errors: null,
    });
  }
  next();
}

module.exports = {
  apiLimiter,
  authLimiter,
  financialLimiter,
  sanitizeInput,
  validateObjectId,
  validateCashLimit,
};
