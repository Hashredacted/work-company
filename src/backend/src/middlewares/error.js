'use strict';

const { redactSensitiveData } = require('../utils/redactor');

// Centralized zero-leak error handler — must be registered last in Express app
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // Log securely without leaking secrets or tokens
  const safeLog = redactSensitiveData({
    message: err.message,
    name: err.name,
    code: err.code,
    status: err.statusCode || err.status || 500,
    path: req.originalUrl || req.path,
    method: req.method,
  });
  console.error('[ERROR]', safeLog);

  const status = err.statusCode || err.status || 500;

  // Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    const rawField = Object.keys(err.keyValue || {})[0] || 'record';
    const fieldName = rawField.replace(/Hash$/i, ''); // e.g. accountNumberHash -> accountNumber
    return res.status(409).json({
      data: null,
      message: `${fieldName} already exists`,
      errors: null, // Never echo raw database field values
    });
  }

  // Mongoose schema validation errors
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({
      data: null,
      message: 'Validation failed',
      errors: redactSensitiveData(errors),
    });
  }

  // JWT / Auth errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      data: null,
      message: 'Invalid or expired authentication token',
      errors: null,
    });
  }

  // Internal Server Errors (500) — Never expose stack traces or internal DB info
  const isProduction = process.env.NODE_ENV === 'production';
  let safeMessage = err.message || 'Internal server error';

  // Sanitize any potential connection strings or internal file paths
  if (safeMessage.includes('mongodb') || safeMessage.includes('at ') || isProduction && status === 500) {
    safeMessage = 'An unexpected server error occurred. Please try again later.';
  }

  return res.status(status).json({
    data: null,
    message: safeMessage,
    errors: null,
  });
}

module.exports = { errorHandler };
