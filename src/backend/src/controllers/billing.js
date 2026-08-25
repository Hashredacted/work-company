'use strict';

const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Invoice = require('../models/Invoice');
const Tenant = require('../models/Tenant');
const AuditLog = require('../models/AuditLog');

// ─── GET /api/billing/plans ──────────────────────────────────────────────────
// Public — list all active plans

async function listPlans(_req, res, next) {
  try {
    const plans = await Plan.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    return res.status(200).json({ data: plans, message: 'Plans retrieved', errors: null });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/billing/subscription ──────────────────────────────────────────
// Tenant: get current subscription

async function getSubscription(req, res, next) {
  try {
    const tenant = await Tenant.findById(req.tenantId)
      .populate('planId')
      .populate('subscriptionId')
      .lean();

    if (!tenant) return res.status(404).json({ data: null, message: 'Tenant not found', errors: null });

    return res.status(200).json({
      data: {
        tenant: {
          name: tenant.name,
          status: tenant.status,
          trialEndsAt: tenant.trialEndsAt,
          trialStartedAt: tenant.trialStartedAt,
        },
        plan: tenant.planId || null,
        subscription: tenant.subscriptionId || null,
      },
      message: 'Subscription details retrieved',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/billing/subscribe ─────────────────────────────────────────────
// Tenant: subscribe to a plan (simulated — no real payment gateway)

async function subscribeToPlan(req, res, next) {
  try {
    const { planId, billingCycle = 'monthly' } = req.body;
    if (!planId) {
      return res.status(400).json({ data: null, message: 'planId is required', errors: null });
    }

    const plan = await Plan.findById(planId);
    if (!plan || !plan.isActive) {
      return res.status(404).json({ data: null, message: 'Plan not found or inactive', errors: null });
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    // Cancel any existing active subscription
    await Subscription.updateMany(
      { tenantId: req.tenantId, status: { $in: ['ACTIVE', 'TRIALING'] } },
      { $set: { status: 'CANCELLED', cancelledAt: now } }
    );

    // Create new subscription
    const subscription = await Subscription.create({
      tenantId: req.tenantId,
      planId: plan._id,
      status: 'ACTIVE',
      billingCycle,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      autoRenew: true,
    });

    // Generate invoice
    const price = billingCycle === 'yearly' ? plan.price.yearly : plan.price.monthly;
    const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await Invoice.create({
      tenantId: req.tenantId,
      subscriptionId: subscription._id,
      invoiceNumber,
      status: plan.isFree ? 'PAID' : 'PAID', // Simulated as paid
      currency: plan.currency || 'USD',
      subtotal: price,
      tax: Math.round(price * 0.18 * 100) / 100, // 18% GST
      total: Math.round(price * 1.18 * 100) / 100,
      dueDate: now,
      paidAt: now,
      billingPeriodStart: now,
      billingPeriodEnd: periodEnd,
      lineItems: [{
        description: `${plan.displayName} — ${billingCycle} subscription`,
        quantity: 1,
        unitPrice: price,
        amount: price,
      }],
    });

    // Update tenant — activate if on trial
    await Tenant.findByIdAndUpdate(req.tenantId, {
      planId: plan._id,
      subscriptionId: subscription._id,
      status: 'ACTIVE',
    });

    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'SUBSCRIPTION_CREATED',
      resource: 'subscription',
      resourceId: subscription._id.toString(),
      details: { plan: plan.name, billingCycle, amount: price },
      ip: req.ip,
      userAgent: req.headers ? req.headers['user-agent'] : null,
    });

    return res.status(201).json({
      data: { subscription, plan },
      message: `Successfully subscribed to ${plan.displayName}`,
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/billing/cancel ────────────────────────────────────────────────
// Tenant: cancel active subscription

async function cancelSubscription(req, res, next) {
  try {
    const { reason } = req.body;
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant || !tenant.subscriptionId) {
      return res.status(404).json({ data: null, message: 'No active subscription found', errors: null });
    }

    const subscription = await Subscription.findByIdAndUpdate(
      tenant.subscriptionId,
      { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason || null, autoRenew: false },
      { returnDocument: 'after' }
    );

    await AuditLog.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      action: 'SUBSCRIPTION_CANCELLED',
      resource: 'subscription',
      resourceId: subscription._id.toString(),
      details: { reason },
      ip: req.ip,
      userAgent: req.headers ? req.headers['user-agent'] : null,
    });

    return res.status(200).json({
      data: subscription,
      message: 'Subscription cancelled successfully',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/billing/invoices ───────────────────────────────────────────────
// Tenant: list invoices

async function listInvoices(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const query = { tenantId: req.tenantId };

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .populate('subscriptionId', 'planId billingCycle')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      Invoice.countDocuments(query),
    ]);

    return res.status(200).json({
      data: {
        invoices,
        pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), totalPages: Math.ceil(total / parseInt(limit, 10)) },
      },
      message: 'Invoices retrieved',
      errors: null,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/billing/invoices/:id ───────────────────────────────────────────
async function getInvoice(req, res, next) {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('subscriptionId')
      .lean();

    if (!invoice) return res.status(404).json({ data: null, message: 'Invoice not found', errors: null });

    return res.status(200).json({ data: invoice, message: 'Invoice retrieved', errors: null });
  } catch (err) {
    next(err);
  }
}

module.exports = { listPlans, getSubscription, subscribeToPlan, cancelSubscription, listInvoices, getInvoice };
