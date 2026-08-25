'use strict';

// Centralized error handler — must be registered last in Express app

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  console.error('[ERROR]', err);

  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      data: null,
      message: `${field} already exists`,
      errors: err.keyValue,
    });
  }

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ data: null, message: 'Validation failed', errors });
  }

  return res.status(status).json({ data: null, message, errors: null });
}

module.exports = { errorHandler };
