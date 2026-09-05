/**
 * Authentication & Tenant Context Helpers
 */
(function(root) {
  'use strict';

  function getToken() {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('auth_token') || localStorage.getItem('token') || null;
  }

  function getCurrentUser() {
    if (typeof localStorage === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem('auth_user') || '{}');
    } catch {
      return {};
    }
  }

  function getCurrentTenantId() {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem('selected_tenant_id') || localStorage.getItem('activeCompanyId') || '';
  }

  function authGuard() {
    const token = getToken();
    if (!token) {
      if (typeof window !== 'undefined' && !window.location.pathname.includes('index.html')) {
        window.location.href = 'index.html';
      }
      return false;
    }
    return true;
  }

  function signOut(promptConfirm = true) {
    if (promptConfirm && typeof confirm === 'function') {
      if (!confirm('Are you sure you want to sign out of WorkSpace?')) return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('token');
      localStorage.removeItem('selected_tenant_id');
    }
    if (typeof window !== 'undefined') {
      window.location.href = 'index.html';
    }
  }

  const AuthUtils = {
    getToken,
    getCurrentUser,
    getCurrentTenantId,
    authGuard,
    signOut,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthUtils;
  }
  root.AppAuthUtils = AuthUtils;
})(typeof window !== 'undefined' ? window : globalThis);
