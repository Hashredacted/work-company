'use strict';

/**
 * Standard API Success Response helper
 * 
 * @param {import('express').Response} res
 * @param {any} data
 * @param {string} [message='OK']
 * @param {number} [statusCode=200]
 */
function sendSuccess(res, data = null, message = 'OK', statusCode = 200) {
  return res.status(statusCode).json({
    data,
    message,
    errors: null,
  });
}

/**
 * Standard API Error Response helper
 * 
 * @param {import('express').Response} res
 * @param {string} [message='An error occurred']
 * @param {any} [errors=null]
 * @param {number} [statusCode=400]
 */
function sendError(res, message = 'An error occurred', errors = null, statusCode = 400) {
  return res.status(statusCode).json({
    data: null,
    message,
    errors,
  });
}

module.exports = {
  sendSuccess,
  sendError,
};
