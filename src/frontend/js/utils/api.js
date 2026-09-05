/**
 * API Client & Normalized Entity Loaders
 * Automatically handles baseURL, auth token, tenant headers, and unwrapping varied response structures.
 */
(function(root) {
  'use strict';

  function getApiBase() {
    if (typeof window === 'undefined') return '/api';
    const loc = window.location;
    if (loc.origin && (loc.origin.includes(':3000') || loc.origin.includes(':5500') || loc.protocol === 'file:')) {
      return 'http://localhost:5000/api';
    }
    return '/api';
  }

  function getHeaders(extraHeaders = {}) {
    const token = (typeof localStorage !== 'undefined')
      ? (localStorage.getItem('auth_token') || localStorage.getItem('token') || '')
      : '';
    const tenantId = (typeof localStorage !== 'undefined')
      ? (localStorage.getItem('selected_tenant_id') || localStorage.getItem('activeCompanyId') || '')
      : '';

    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
      ...extraHeaders,
    };
  }

  async function apiFetch(endpoint, options = {}) {
    const baseUrl = getApiBase();
    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const opts = {
      ...options,
      headers: getHeaders(options.headers || {}),
    };

    const res = await fetch(url, opts);
    if (res.status === 401) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }
      if (typeof window !== 'undefined' && !window.location.pathname.includes('index.html')) {
        window.location.href = 'index.html';
      }
    }
    return res;
  }

  // --- Normalized Entity Fetchers ---

  async function fetchProducts(params = {}) {
    try {
      const q = new URLSearchParams({ limit: 1000, ...params }).toString();
      const res = await apiFetch(`/inventory/products?${q}`);
      if (!res.ok) return [];
      const json = await res.json();
      const raw = json.data?.products || (Array.isArray(json.data) ? json.data : (json.data?.items || []));
      return Array.from(new Map(raw.map(p => [p._id, p])).values());
    } catch (e) {
      console.warn('fetchProducts error:', e);
      return [];
    }
  }

  async function fetchCustomers(params = {}) {
    try {
      const q = new URLSearchParams({ limit: 1000, ...params }).toString();
      const res = await apiFetch(`/inventory/customers?${q}`);
      if (!res.ok) return [];
      const json = await res.json();
      const raw = json.data?.items || (Array.isArray(json.data) ? json.data : []);
      return Array.from(new Map(raw.map(c => [c._id, c])).values());
    } catch (e) {
      console.warn('fetchCustomers error:', e);
      return [];
    }
  }

  async function fetchSuppliers(params = {}) {
    try {
      const q = new URLSearchParams({ limit: 1000, ...params }).toString();
      const res = await apiFetch(`/inventory/suppliers?${q}`);
      if (!res.ok) return [];
      const json = await res.json();
      const raw = json.data?.items || (Array.isArray(json.data) ? json.data : []);
      return Array.from(new Map(raw.map(s => [s._id, s])).values());
    } catch (e) {
      console.warn('fetchSuppliers error:', e);
      return [];
    }
  }

  async function fetchWarehouses(params = {}) {
    try {
      const q = new URLSearchParams(params).toString();
      const res = await apiFetch(`/inventory/warehouses${q ? `?${q}` : ''}`);
      if (!res.ok) return [];
      const json = await res.json();
      const raw = Array.isArray(json.data) ? json.data : (json.data?.items || []);
      return Array.from(new Map(raw.map(w => [w._id, w])).values());
    } catch (e) {
      console.warn('fetchWarehouses error:', e);
      return [];
    }
  }

  async function fetchCategories(params = {}) {
    try {
      const q = new URLSearchParams(params).toString();
      const res = await apiFetch(`/inventory/categories${q ? `?${q}` : ''}`);
      if (!res.ok) return [];
      const json = await res.json();
      const raw = Array.isArray(json.data) ? json.data : (json.data?.categories || []);
      return Array.from(new Map(raw.map(c => [c._id, c])).values());
    } catch (e) {
      console.warn('fetchCategories error:', e);
      return [];
    }
  }

  async function fetchBankAccounts(params = {}) {
    try {
      const q = new URLSearchParams(params).toString();
      const res = await apiFetch(`/inventory/finance/bank-accounts${q ? `?${q}` : ''}`);
      if (!res.ok) return [];
      const json = await res.json();
      const raw = Array.isArray(json.data) ? json.data : (json.data?.accounts || []);
      return Array.from(new Map(raw.map(b => [b._id, b])).values());
    } catch (e) {
      console.warn('fetchBankAccounts error:', e);
      return [];
    }
  }

  async function fetchCompanies() {
    try {
      const res = await apiFetch('/inventory/companies');
      if (!res.ok) return [];
      const json = await res.json();
      const raw = Array.isArray(json.data) ? json.data : (json.data?.companies || []);
      return Array.from(new Map(raw.map(c => [c._id, c])).values());
    } catch (e) {
      console.warn('fetchCompanies error:', e);
      return [];
    }
  }

  const ApiUtils = {
    getApiBase,
    getHeaders,
    H: getHeaders,
    apiFetch,
    fetchProducts,
    fetchCustomers,
    fetchSuppliers,
    fetchWarehouses,
    fetchCategories,
    fetchBankAccounts,
    fetchCompanies,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ApiUtils;
  }
  root.AppApiUtils = ApiUtils;
})(typeof window !== 'undefined' ? window : globalThis);
