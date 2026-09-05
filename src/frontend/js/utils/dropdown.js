/**
 * Universal Dropdown & Searchable Combobox Engine
 * Standardizes entity loading, option generation, and searchable comboboxes across all pages.
 */
(function(root) {
  'use strict';

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function smartMatch(text, query) {
    if (!query) return true;
    if (!text) return false;
    const t = String(text).toLowerCase();
    const q = String(query).toLowerCase().trim();
    if (!q) return true;
    if (t.includes(q)) return true;
    const words = t.split(/[\s\-_\/,\.]+/);
    return words.some(w => w.startsWith(q));
  }

  /**
   * Universal Dropdown Populator
   *
   * @param {string|HTMLSelectElement} selectElOrId
   * @param {Array<any>} items
   * @param {Object} [options]
   * @param {string} [options.placeholder='— Select —']
   * @param {string} [options.placeholderValue='']
   * @param {string} [options.valueKey='_id']
   * @param {string} [options.labelKey='name']
   * @param {any} [options.selectedValue=null]
   * @param {Function} [options.formatLabel] - (item) => string
   * @param {Function} [options.formatOption] - (item, isSelected) => string
   * @param {boolean|string} [options.makeSearchable=false] - placeholder or true
   */
  function populateDropdown(selectElOrId, items = [], options = {}) {
    const el = typeof selectElOrId === 'string' ? document.getElementById(selectElOrId) : selectElOrId;
    if (!el) return null;

    const placeholder = options.placeholder !== undefined ? options.placeholder : '— Select —';
    const placeholderVal = options.placeholderValue !== undefined ? options.placeholderValue : '';
    const valKey = options.valueKey || '_id';
    const labelKey = options.labelKey || 'name';
    const selVal = options.selectedValue !== undefined ? String(options.selectedValue) : null;

    let html = '';
    if (placeholder !== false && placeholder !== null) {
      html += `<option value="${esc(placeholderVal)}">${esc(placeholder)}</option>`;
    }

    if (Array.isArray(items)) {
      items.forEach(item => {
        if (options.formatOption) {
          const itemVal = typeof item === 'object' && item !== null ? String(item[valKey] ?? '') : String(item);
          const isSelected = selVal !== null && itemVal === selVal;
          html += options.formatOption(item, isSelected);
        } else {
          const isObj = typeof item === 'object' && item !== null;
          const val = isObj ? (item[valKey] ?? '') : item;
          const label = options.formatLabel ? options.formatLabel(item) : (isObj ? (item[labelKey] ?? val) : item);
          const isSelected = selVal !== null && String(val) === selVal;
          html += `<option value="${esc(val)}" ${isSelected ? 'selected' : ''}>${esc(label)}</option>`;
        }
      });
    }

    el.innerHTML = html;

    // Synchronize or attach SearchableSelect
    if (el._searchableSelect) {
      el._searchableSelect.refresh();
    } else if (options.makeSearchable) {
      const ph = typeof options.makeSearchable === 'string' ? options.makeSearchable : '🔍 Type to search…';
      makeSearchable(el, { placeholder: ph });
    }

    return el;
  }

  // --- Specialized Dropdown Populators ---

  /**
   * Standard Product Dropdown Populator
   */
  function populateProductDropdown(selectElOrId, products = [], options = {}) {
    const mode = options.mode || 'SALES';
    return populateDropdown(selectElOrId, products, {
      placeholder: options.placeholder !== undefined ? options.placeholder : '— Select Product —',
      selectedValue: options.selectedValue,
      makeSearchable: options.makeSearchable !== false ? (options.searchPlaceholder || '🔍 Type product name or SKU…') : false,
      formatOption: (p, isSel) => {
        const price = mode === 'SALES' ? (p.sellingPrice || p.mrp || 0) : (p.purchasePrice || 0);
        const skuStr = p.sku ? ` (${p.sku})` : '';
        const priceStr = price ? ` · ₹${Number(price).toLocaleString('en-IN')}` : '';
        const tracking = p.trackingType || 'NONE';
        const cost = p.purchasePrice || 0;
        const sell = p.sellingPrice || p.mrp || 0;
        return `<option value="${p._id}" data-sku="${esc(p.sku || '')}" data-price="${price}" data-cost="${cost}" data-sell="${sell}" data-tracking="${tracking}" data-unit="${esc(p.unit || 'PCS')}" data-hsn="${esc(p.hsnCode || '')}" data-gst="${p.gstRate ?? 18}" ${isSel ? 'selected' : ''}>${esc(p.name)}${esc(skuStr)}${esc(priceStr)}</option>`;
      },
    });
  }

  /**
   * Standard Party (Customer / Supplier) Dropdown Populator
   */
  function populatePartyDropdown(selectElOrId, parties = [], options = {}) {
    const type = options.type || 'CUSTOMER';
    const defaultPlaceholder = type === 'CUSTOMER' ? '— Select Customer —' : '— Select Supplier —';
    const defaultSearchPh = type === 'CUSTOMER' ? '🔍 Type customer name, phone…' : '🔍 Type supplier name, phone…';

    return populateDropdown(selectElOrId, parties, {
      placeholder: options.placeholder !== undefined ? options.placeholder : defaultPlaceholder,
      selectedValue: options.selectedValue,
      makeSearchable: options.makeSearchable !== false ? (options.searchPlaceholder || defaultSearchPh) : false,
      formatOption: (p, isSel) => {
        const phoneStr = p.phone ? ` (${p.phone})` : '';
        const gstinStr = p.gstin ? ` · GSTIN: ${p.gstin}` : '';
        const bal = p.outstanding || p.currentBalance || 0;
        return `<option value="${p._id}" data-phone="${esc(p.phone || '')}" data-gstin="${esc(p.gstin || '')}" data-state="${esc(p.state || 'Local')}" data-bal="${bal}" ${isSel ? 'selected' : ''}>${esc(p.name)}${esc(phoneStr)}${esc(gstinStr)}</option>`;
      },
    });
  }

  /**
   * Standard Warehouse Dropdown Populator
   */
  function populateWarehouseDropdown(selectElOrId, warehouses = [], options = {}) {
    return populateDropdown(selectElOrId, warehouses, {
      placeholder: options.placeholder !== undefined ? options.placeholder : '— Select Warehouse —',
      selectedValue: options.selectedValue,
      makeSearchable: options.makeSearchable !== false ? (options.searchPlaceholder || '🔍 Search warehouse…') : false,
      formatOption: (w, isSel) => {
        const codeStr = w.code ? ` (${w.code})` : '';
        return `<option value="${w._id}" data-code="${esc(w.code || '')}" ${isSel ? 'selected' : ''}>${esc(w.name)}${esc(codeStr)}</option>`;
      },
    });
  }

  /**
   * Standard Category Dropdown Populator (Hierarchical optgroups supported)
   */
  function populateCategoryDropdown(selectElOrId, categories = [], options = {}) {
    const el = typeof selectElOrId === 'string' ? document.getElementById(selectElOrId) : selectElOrId;
    if (!el) return null;

    const placeholder = options.placeholder !== undefined ? options.placeholder : '— Select Category —';
    const selVal = options.selectedValue !== undefined ? String(options.selectedValue) : null;
    const allowCreateNew = options.allowCreateNew === true;

    let html = '';
    if (placeholder !== false && placeholder !== null) {
      html += `<option value="">${esc(placeholder)}</option>`;
    }
    if (allowCreateNew) {
      html += '<option value="__NEW__" style="color:#6366f1;font-weight:700;">➕ + Create Custom Category...</option>';
    }

    const rootCats = categories.filter(c => !c.parentId);
    const subCats = categories.filter(c => c.parentId);

    if (rootCats.length > 0) {
      rootCats.forEach(root => {
        const children = subCats.filter(s => String(s.parentId?._id || s.parentId) === String(root._id));
        const icon = root.icon || '🏷️';
        if (children.length > 0) {
          html += `<optgroup label="${icon} ${esc(root.name)}">`;
          html += `<option value="${root._id}" data-hsn="${esc(root.defaultHsn || '')}" data-gst="${root.defaultGstRate ?? 18}" ${selVal === String(root._id) ? 'selected' : ''}>${icon} All ${esc(root.name)}</option>`;
          children.forEach(sub => {
            html += `<option value="${sub._id}" data-hsn="${esc(sub.defaultHsn || root.defaultHsn || '')}" data-gst="${sub.defaultGstRate ?? root.defaultGstRate ?? 18}" ${selVal === String(sub._id) ? 'selected' : ''}>  └ ${esc(sub.name)}</option>`;
          });
          html += `</optgroup>`;
        } else {
          html += `<option value="${root._id}" data-hsn="${esc(root.defaultHsn || '')}" data-gst="${root.defaultGstRate ?? 18}" ${selVal === String(root._id) ? 'selected' : ''}>${icon} ${esc(root.name)}</option>`;
        }
      });
    } else {
      categories.forEach(c => {
        html += `<option value="${c._id}" data-hsn="${esc(c.defaultHsn || '')}" data-gst="${c.defaultGstRate ?? 18}" ${selVal === String(c._id) ? 'selected' : ''}>${c.icon || '🏷️'} ${esc(c.name)}</option>`;
      });
    }

    el.innerHTML = html;

    if (el._searchableSelect) {
      el._searchableSelect.refresh();
    } else if (options.makeSearchable) {
      makeSearchable(el, { placeholder: typeof options.makeSearchable === 'string' ? options.makeSearchable : '🔍 Search category…' });
    }

    return el;
  }

  /**
   * Standard Bank Account Dropdown Populator
   */
  function populateBankDropdown(selectElOrId, banks = [], options = {}) {
    return populateDropdown(selectElOrId, banks, {
      placeholder: options.placeholder !== undefined ? options.placeholder : '— Primary Bank / Cash Register —',
      selectedValue: options.selectedValue,
      makeSearchable: options.makeSearchable !== false ? (options.searchPlaceholder || '🔍 Select bank…') : false,
      formatOption: (b, isSel) => {
        const mask = b.accountNumberMasked || (b.accountNumber ? `•••• ${b.accountNumber.slice(-4)}` : '');
        const star = b.isDefault ? ' ⭐' : '';
        const name = b.bankName || b.accountName || 'Bank Account';
        return `<option value="${b._id}" data-acc="${esc(b.accountNumber || '')}" data-ifsc="${esc(b.ifscCode || '')}" data-upi="${esc(b.upiId || '')}" ${isSel || (b.isDefault && !options.selectedValue) ? 'selected' : ''}>🏦 ${esc(name)} (${esc(mask)})${star}</option>`;
      },
    });
  }

  /**
   * Standard Company Switcher Dropdown Populator
   */
  function populateCompanyDropdown(selectElOrId, companies = [], options = {}) {
    return populateDropdown(selectElOrId, companies, {
      placeholder: options.placeholder !== undefined ? options.placeholder : '— All Companies / Consolidated —',
      selectedValue: options.selectedValue,
      makeSearchable: options.makeSearchable !== false ? (options.searchPlaceholder || '🔍 Switch company…') : false,
      formatOption: (c, isSel) => {
        const gstinStr = c.gstin ? ` (${c.gstin})` : '';
        return `<option value="${c._id}" ${isSel ? 'selected' : ''}>🏢 ${esc(c.name)}${esc(gstinStr)}</option>`;
      },
    });
  }

  // --- SearchableSelect Implementation ---

  class SearchableSelect {
    constructor(selectEl, options = {}) {
      if (!selectEl) return null;
      if (selectEl._searchableSelect) {
        if (options.placeholder) selectEl._searchableSelect.placeholder = options.placeholder;
        selectEl._searchableSelect.refresh();
        return selectEl._searchableSelect;
      }

      this.selectEl = selectEl;
      this.placeholder = options.placeholder || '🔍 Type to filter / select…';
      this.activeIdx = -1;
      this.isOpen = false;
      this.selectEl._searchableSelect = this;

      this.init();
    }

    init() {
      this.selectEl.style.display = 'none';

      this.wrap = document.createElement('div');
      this.wrap.className = 'ac-combobox-wrap';
      if (this.selectEl.className) {
        if (this.selectEl.classList.contains('form-select')) this.wrap.classList.add('form-select-wrap');
        if (this.selectEl.classList.contains('clean-input')) this.wrap.classList.add('clean-input-wrap');
      }

      this.input = document.createElement('input');
      this.input.type = 'text';
      this.input.className = 'ac-combobox-input';
      this.input.placeholder = this.placeholder;
      this.input.autocomplete = 'off';

      this.arrow = document.createElement('span');
      this.arrow.className = 'ac-combobox-arrow';
      this.arrow.textContent = '▾';

      this.dropdown = document.createElement('div');
      this.dropdown.className = 'ac-combobox-dropdown';

      this.wrap.appendChild(this.input);
      this.wrap.appendChild(this.arrow);
      this.wrap.appendChild(this.dropdown);

      if (this.selectEl.parentNode) {
        this.selectEl.parentNode.insertBefore(this.wrap, this.selectEl.nextSibling);
      }

      this.bindEvents();
      this.refresh();
      this.observeMutations();
    }

    observeMutations() {
      const observer = new MutationObserver(() => {
        this.refresh();
      });
      observer.observe(this.selectEl, { childList: true, subtree: true, attributes: true });
    }

    getSelectedOption() {
      const val = this.selectEl.value;
      const opts = Array.from(this.selectEl.options);
      return opts.find(o => o.value === val) || opts[0];
    }

    refresh() {
      const selected = this.getSelectedOption();
      if (selected && document.activeElement !== this.input) {
        this.input.value = (selected.value ? selected.text : '') || '';
      }
    }

    render(query = '') {
      const q = (query || '').toLowerCase().trim();
      const rawOptions = Array.from(this.selectEl.options);
      const selectedVal = this.selectEl.value;

      const filtered = q
        ? rawOptions.filter(o => smartMatch(o.text, q) || smartMatch(o.value, q))
        : rawOptions;

      this.activeIdx = -1;

      if (filtered.length === 0) {
        this.dropdown.innerHTML = `<div class="ac-combobox-no-results">No options matching "<strong>${esc(query)}</strong>"</div>`;
        this.open();
        return;
      }

      this.dropdown.innerHTML = filtered.map((opt, i) => `
        <div class="ac-combobox-opt ${opt.value === selectedVal ? 'selected' : ''}" data-val="${esc(opt.value)}" data-text="${esc(opt.text)}" data-idx="${i}">
          <span>${esc(opt.text)}</span>
          ${opt.value === selectedVal ? '<span style="color:#4ade80;font-size:0.8rem;margin-left:auto;">✓</span>' : ''}
        </div>
      `).join('');

      this.dropdown.querySelectorAll('.ac-combobox-opt').forEach(item => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.selectOption(item.getAttribute('data-val'), item.getAttribute('data-text'));
        });
      });

      this.open();
    }

    selectOption(val, text) {
      this.selectEl.value = val;
      this.input.value = val ? text : '';
      this.close();
      this.selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      this.selectEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    open() {
      document.querySelectorAll('.ac-combobox-dropdown.show').forEach(d => {
        if (d !== this.dropdown) d.classList.remove('show');
      });
      document.querySelectorAll('.ac-combobox-wrap.open').forEach(w => {
        if (w !== this.wrap) w.classList.remove('open');
      });

      this.dropdown.classList.add('show');
      this.wrap.classList.add('open');
      this.isOpen = true;
    }

    close() {
      this.dropdown.classList.remove('show');
      this.wrap.classList.remove('open');
      this.isOpen = false;
      this.activeIdx = -1;
    }

    bindEvents() {
      this.input.addEventListener('focus', () => {
        this.input.select();
        this.render('');
      });

      this.input.addEventListener('input', () => {
        this.render(this.input.value);
      });

      this.arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.isOpen) {
          this.close();
        } else {
          this.input.focus();
          this.render('');
        }
      });

      this.input.addEventListener('keydown', (e) => {
        const items = Array.from(this.dropdown.querySelectorAll('.ac-combobox-opt'));
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (!this.isOpen) { this.render(''); return; }
          this.activeIdx = Math.min(this.activeIdx + 1, items.length - 1);
          this.highlight(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (!this.isOpen) return;
          this.activeIdx = Math.max(this.activeIdx - 1, 0);
          this.highlight(items);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (this.activeIdx >= 0 && items[this.activeIdx]) {
            items[this.activeIdx].dispatchEvent(new MouseEvent('mousedown'));
          } else if (items.length > 0) {
            items[0].dispatchEvent(new MouseEvent('mousedown'));
          }
        } else if (e.key === 'Escape') {
          this.close();
        }
      });

      document.addEventListener('click', (e) => {
        if (!this.wrap.contains(e.target)) {
          this.close();
          const selected = this.getSelectedOption();
          if (selected) {
            this.input.value = (selected.value ? selected.text : '') || '';
          }
        }
      });
    }

    highlight(items) {
      items.forEach(el => el.classList.remove('ac-active'));
      if (items[this.activeIdx]) {
        items[this.activeIdx].classList.add('ac-active');
        items[this.activeIdx].scrollIntoView({ block: 'nearest' });
      }
    }
  }

  function makeSearchable(selectIdOrEl, placeholderOrOpts = '🔍 Type to filter / select…') {
    const el = typeof selectIdOrEl === 'string' ? document.getElementById(selectIdOrEl) : selectIdOrEl;
    if (!el) return null;
    const opts = typeof placeholderOrOpts === 'string' ? { placeholder: placeholderOrOpts } : (placeholderOrOpts || {});
    return new SearchableSelect(el, opts);
  }

  const DropdownUtils = {
    populateDropdown,
    populateProductDropdown,
    populatePartyDropdown,
    populateWarehouseDropdown,
    populateCategoryDropdown,
    populateBankDropdown,
    populateCompanyDropdown,
    makeSearchable,
    SearchableSelect,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DropdownUtils;
  }
  root.AppDropdownUtils = DropdownUtils;
})(typeof window !== 'undefined' ? window : globalThis);
