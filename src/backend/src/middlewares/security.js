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

// ─── Deep NoSQL Injection & Query Sanitizer (Express 5 compatible) ────────────
const DANGEROUS_OPERATORS = /^\$(where|regex|gt|gte|lt|lte|ne|nin|in|expr|jsonSchema|function|accumulator|exec)/i;

function sanitizeInPlace(obj, depth = 0) {
  if (depth > 12 || !obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === 'object') {
        sanitizeInPlace(obj[i], depth + 1);
      }
    }
    return;
  }

  for (const key of Object.keys(obj)) {
    // Drop keys with MongoDB operators ($gt, $ne, $where, etc.) or dot notation
    if (key.startsWith('$') || key.includes('.') || DANGEROUS_OPERATORS.test(key)) {
      delete obj[key];
    } else if (typeof obj[key] === 'object') {
      sanitizeInPlace(obj[key], depth + 1);
    } else if (typeof obj[key] === 'string') {
      // Strip null-byte injections
      if (obj[key].includes('\0')) {
        obj[key] = obj[key].replace(/\0/g, '');
      }
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
