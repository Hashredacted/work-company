'use strict';

const Category = require('../../models/inv/Category');
const Product = require('../../models/inv/Product');
const { INDIAN_CATEGORY_PRESETS } = require('../../constants/indianCategories');

/**
 * Helper to seed standard Indian categories into a tenant workspace
 */
async function seedIndianPresetsForTenant(tenantId) {
  for (const preset of INDIAN_CATEGORY_PRESETS) {
    let parent = await Category.findOne({
      tenantId,
      name: preset.name,
      deletedAt: null,
    });

    if (!parent) {
      parent = await Category.create({
        tenantId,
        name: preset.name,
        code: preset.code,
        icon: preset.icon || '📦',
        defaultHsn: preset.defaultHsn || '',
        defaultGstRate: preset.defaultGstRate ?? 18,
        sortOrder: preset.sortOrder || 0,
        parentId: null,
      });
    }

    if (preset.subcategories && preset.subcategories.length) {
      for (const sub of preset.subcategories) {
        const subExists = await Category.findOne({
          tenantId,
          name: sub.name,
          parentId: parent._id,
          deletedAt: null,
        });

        if (!subExists) {
          await Category.create({
            tenantId,
            name: sub.name,
            code: sub.code,
            icon: preset.icon || '📦',
            defaultHsn: sub.defaultHsn || parent.defaultHsn || '',
            defaultGstRate: sub.defaultGstRate ?? parent.defaultGstRate ?? 18,
            sortOrder: preset.sortOrder || 0,
            parentId: parent._id,
          });
        }
      }
    }
  }
}

// GET /api/inventory/categories
async function list(req, res, next) {
  try {
    // Auto-ensure presets if tenant has 0 categories
    const count = await Category.countDocuments({ tenantId: req.tenantId, deletedAt: null, isActive: true });
    if (count === 0) {
      await seedIndianPresetsForTenant(req.tenantId);
    }

    const cats = await Category.find({ tenantId: req.tenantId, deletedAt: null, isActive: true })
      .sort({ sortOrder: 1, parentId: 1, name: 1 })
      .populate('parentId', 'name code defaultHsn defaultGstRate icon')
      .lean();

    res.json({ data: cats, message: 'OK', errors: null });
  } catch (e) {
    next(e);
  }
}

// POST /api/inventory/categories
async function create(req, res, next) {
  try {
    const { name, code, parentId, description, defaultHsn, defaultGstRate, defaultCessRate, icon, sortOrder } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ data: null, message: 'Category name is required', errors: null });
    }

    const trimmedName = name.trim();
    const existing = await Category.findOne({
      tenantId: req.tenantId,
      name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      parentId: parentId || null,
      deletedAt: null,
    });

    if (existing) {
      return res.status(409).json({ data: null, message: `Category "${trimmedName}" already exists in this section`, errors: null });
    }

    const cat = await Category.create({
      tenantId: req.tenantId,
      name: trimmedName,
      code: code ? code.trim().toUpperCase() : undefined,
      parentId: parentId || null,
      description: description ? description.trim() : undefined,
      defaultHsn: defaultHsn ? defaultHsn.trim() : undefined,
      defaultGstRate: defaultGstRate !== undefined ? Number(defaultGstRate) : 18,
      defaultCessRate: defaultCessRate !== undefined ? Number(defaultCessRate) : 0,
      icon: icon || '📦',
      sortOrder: sortOrder ? Number(sortOrder) : 0,
    });

    res.status(201).json({ data: cat, message: 'Category created successfully', errors: null });
  } catch (e) {
    next(e);
  }
}

// PUT /api/inventory/categories/:id
async function update(req, res, next) {
  try {
    const { parentId } = req.body;
    if (parentId && String(parentId) === String(req.params.id)) {
      return res.status(400).json({ data: null, message: 'A category cannot be its own parent', errors: null });
    }

    const cat = await Category.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, deletedAt: null },
      { $set: req.body },
      { new: true }
    );
    if (!cat) return res.status(404).json({ data: null, message: 'Category not found', errors: null });
    res.json({ data: cat, message: 'Category updated', errors: null });
  } catch (e) {
    next(e);
  }
}

// DELETE /api/inventory/categories/:id
async function remove(req, res, next) {
  try {
    const inUse = await Product.countDocuments({ tenantId: req.tenantId, categoryId: req.params.id, deletedAt: null });
    if (inUse > 0) {
      return res.status(400).json({
        data: null,
        message: `Cannot delete: ${inUse} product(s) are currently assigned to this category. Please reassign products first.`,
        errors: null,
      });
    }

    const hasChildren = await Category.countDocuments({ tenantId: req.tenantId, parentId: req.params.id, deletedAt: null, isActive: true });
    if (hasChildren > 0) {
      return res.status(400).json({
        data: null,
        message: `Cannot delete: this category has ${hasChildren} active subcategories. Delete or reassign subcategories first.`,
        errors: null,
      });
    }

    await Category.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { deletedAt: new Date(), isActive: false }
    );
    res.json({ data: null, message: 'Category deleted successfully', errors: null });
  } catch (e) {
    next(e);
  }
}

// POST /api/inventory/categories/presets
async function seedPresets(req, res, next) {
  try {
    await seedIndianPresetsForTenant(req.tenantId);
    const all = await Category.find({ tenantId: req.tenantId, deletedAt: null, isActive: true })
      .sort({ sortOrder: 1, parentId: 1, name: 1 })
      .populate('parentId', 'name code')
      .lean();

    res.json({ data: all, message: 'Indian category presets loaded successfully', errors: null });
  } catch (e) {
    next(e);
  }
}

module.exports = {
  list,
  create,
  update,
  remove,
  seedPresets,
  seedIndianPresetsForTenant,
};
