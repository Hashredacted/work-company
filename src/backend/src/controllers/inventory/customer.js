'use strict';

const Customer = require('../../models/inv/Customer');

const crud = (Model) => ({
  async list(req, res, next) {
    try {
      const { search, page = 1, limit = 50 } = req.query;
      const filter = { tenantId: req.tenantId, deletedAt: null };
      if (search) filter.$or = [{ name: { $regex: search, $options: 'i' } }, { gstin: { $regex: search, $options: 'i' } }];
      const skip = (Number(page) - 1) * Number(limit);
      const [docs, total] = await Promise.all([
        Model.find(filter).sort({ name: 1 }).skip(skip).limit(Number(limit)).lean(),
        Model.countDocuments(filter),
      ]);
      res.json({ data: { items: docs, total }, message: 'OK', errors: null });
    } catch (e) { next(e); }
  },
  async getOne(req, res, next) {
    try {
      const doc = await Model.findOne({ _id: req.params.id, tenantId: req.tenantId, deletedAt: null }).lean();
      if (!doc) return res.status(404).json({ data: null, message: 'Not found', errors: null });
      res.json({ data: doc, message: 'OK', errors: null });
    } catch (e) { next(e); }
  },
  async create(req, res, next) {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ data: null, message: 'Name is required', errors: null });
      const doc = await Model.create({ tenantId: req.tenantId, ...req.body });
      res.status(201).json({ data: doc, message: 'Created', errors: null });
    } catch (e) { next(e); }
  },
  async update(req, res, next) {
    try {
      const doc = await Model.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenantId },
        { $set: req.body }, { returnDocument: 'after' }
      );
      if (!doc) return res.status(404).json({ data: null, message: 'Not found', errors: null });
      res.json({ data: doc, message: 'Updated', errors: null });
    } catch (e) { next(e); }
  },
  async remove(req, res, next) {
    try {
      await Model.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { deletedAt: new Date(), isActive: false });
      res.json({ data: null, message: 'Deleted', errors: null });
    } catch (e) { next(e); }
  },
});

module.exports = crud(Customer);
