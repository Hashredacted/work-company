'use strict';

const mongoose = require('mongoose');

/**
 * Extracts and sanitizes tenant ID from request context.
 * Supports:
 * - SuperAdmin explicit tenant switching via query parameter (?tenantId=...) or header (x-tenant-id)
 * - Regular authenticated user session tenantId (req.tenantId)
 * 
 * @param {import('express').Request} req
 * @returns {mongoose.Types.ObjectId|null}
 */
function getTenantId(req) {
  if (!req) return null;

  const rawTenant = req.query?.tenantId || req.headers?.['x-tenant-id'];
  
  if (req.isSuperAdmin && rawTenant && mongoose.Types.ObjectId.isValid(rawTenant)) {
    return new mongoose.Types.ObjectId(rawTenant);
  }

  if (req.tenantId && mongoose.Types.ObjectId.isValid(req.tenantId)) {
    return new mongoose.Types.ObjectId(req.tenantId);
  }

  return null;
}

/**
 * Build standard tenant query filter
 * 
 * @param {import('express').Request} req
 * @param {Object} extraQuery
 * @returns {Object}
 */
function tenantFilter(req, extraQuery = {}) {
  const tenantId = getTenantId(req);
  return { tenantId, deletedAt: null, ...extraQuery };
}

module.exports = {
  getTenantId,
  tenantFilter,
};
