/**
 * Sidebar Navigation Controller & Interactive Enhancements
 * Matches modern accounting/billing SaaS sidebar layout.
 */
(function() {
  'use strict';

  // Toggle quick create menu from split arrow
  window.toggleCreateMenu = function(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const menu = document.getElementById('create-quick-menu');
    if (menu) {
      menu.classList.toggle('show');
    }
  };

  // Close quick menu on outside click or escape
  document.addEventListener('click', function(e) {
    const menu = document.getElementById('create-quick-menu');
    if (menu && menu.classList.contains('show')) {
      if (!e.target.closest('.sidebar-top-action')) {
        menu.classList.remove('show');
      }
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const menu = document.getElementById('create-quick-menu');
      if (menu) menu.classList.remove('show');
    }
  });

  // Accordion toggle for nav groups (Sales, Purchases, Reports, Parties)
  window.toggleNavGroup = function(btn) {
    if (!btn) return;
    const group = btn.closest('.nav-group');
    if (group) {
      group.classList.toggle('open');
    }
  };

  // Mobile sidebar toggle
  window.toggleSidebar = function() {
    const sidebar = document.getElementById('app-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('mobile-open');
    }
  };

  // Scroll to bottom hint handler
  window.scrollSidebarMore = function() {
    const nav = document.querySelector('.sidebar');
    if (nav) {
      nav.scrollBy({ top: 180, behavior: 'smooth' });
    }
  };

  // Auto-expand relevant group based on URL
  document.addEventListener('DOMContentLoaded', function() {
    const path = window.location.pathname.toLowerCase();
    const search = window.location.search.toLowerCase();

    // Auto-open groups & activate subitems
    if (path.includes('inv-invoice.html')) {
      const isQuotation = search.includes('type=quotation');
      const isPurchase = search.includes('type=purchase');
      const isSales = !isPurchase && !isQuotation;

      const subSales = document.getElementById('nav-sub-sales-inv');
      const subQuote = document.getElementById('nav-sub-quotation');
      const subPurchase = document.getElementById('nav-sub-purchase-bill');
      if (subSales) subSales.classList.remove('active');
      if (subQuote) subQuote.classList.remove('active');
      if (subPurchase) subPurchase.classList.remove('active');

      if (isQuotation) {
        const salesGrp = document.getElementById('nav-grp-sales');
        if (salesGrp) salesGrp.classList.add('open');
        if (subQuote) subQuote.classList.add('active');
      } else if (isPurchase) {
        const purGrp = document.getElementById('nav-grp-purchases');
        if (purGrp) purGrp.classList.add('open');
        if (subPurchase) subPurchase.classList.add('active');
      } else {
        const salesGrp = document.getElementById('nav-grp-sales');
        if (salesGrp) salesGrp.classList.add('open');
        if (subSales) subSales.classList.add('active');
      }
    } else if (path.includes('inv-reports.html') || path.includes('inv-outstandings.html') || path.includes('inv-finance.html')) {
      const repGrp = document.getElementById('nav-grp-reports');
      if (repGrp) repGrp.classList.add('open');
    } else if (path.includes('inv-customers.html') || path.includes('inv-suppliers.html')) {
      const partyGrp = document.getElementById('nav-grp-parties');
      if (partyGrp) partyGrp.classList.add('open');
    } else if (path.includes('inv-payments.html')) {
      if (search.includes('tab=suppliers')) {
        const purGrp = document.getElementById('nav-grp-purchases');
        if (purGrp) purGrp.classList.add('open');
      } else {
        const salesGrp = document.getElementById('nav-grp-sales');
        if (salesGrp) salesGrp.classList.add('open');
      }
    }

    // Resolve Back to Main destination dynamically based on role
    const userStr = localStorage.getItem('auth_user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        const mainNav = document.getElementById('main-nav-link');
        if (mainNav) {
          mainNav.href = user.isSuperAdmin ? 'dashboard.html' : 'company-dashboard.html';
        }
      } catch (err) {
        console.warn('Could not parse auth_user:', err);
      }
    }

    // Universal Logout Button fallback
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = 'true';
      logoutBtn.addEventListener('click', function() {
        if (confirm('Are you sure you want to sign out of WorkSpace?')) {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
          localStorage.removeItem('selected_tenant_id');
          window.location.href = 'index.html';
        }
      });
    }
  });
})();
