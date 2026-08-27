'use strict';

const API_BASE = 'http://localhost:5000/api';

// ─── DOM refs ──────────────────────────────────────────────────────────────────
const form          = document.getElementById('login-form');
const emailInput    = document.getElementById('email');
const passwordInput = document.getElementById('password');
const emailError    = document.getElementById('email-error');
const passwordError = document.getElementById('password-error');
const formError     = document.getElementById('form-error');
const submitBtn     = document.getElementById('submit-btn');
const btnText       = document.getElementById('btn-text');
const btnSpinner    = document.getElementById('btn-spinner');
const prevBanner    = document.getElementById('prev-login-banner');
const prevText      = document.getElementById('prev-login-text');
const togglePwBtn   = document.getElementById('toggle-pw');

// ─── Password toggle ───────────────────────────────────────────────────────────
togglePwBtn.addEventListener('click', () => {
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  togglePwBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
});

// ─── Inline validation ─────────────────────────────────────────────────────────
emailInput.addEventListener('input', () => {
  emailError.textContent = '';
  emailInput.classList.remove('invalid');
});
passwordInput.addEventListener('input', () => {
  passwordError.textContent = '';
  passwordInput.classList.remove('invalid');
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
function setLoading(state) {
  submitBtn.disabled = state;
  btnText.textContent = state ? 'Signing in…' : 'Sign in';
  btnSpinner.hidden = !state;
}

function showFormError(msg) {
  formError.textContent = msg;
  formError.hidden = false;
}

function clearErrors() {
  formError.hidden = true;
  formError.textContent = '';
  emailError.textContent = '';
  passwordError.textContent = '';
  emailInput.classList.remove('invalid');
  passwordInput.classList.remove('invalid');
}

function formatDate(iso) {
  if (!iso) return null;
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function showPrevLogin(dateIso) {
  const formatted = formatDate(dateIso);
  if (!formatted) return;
  prevText.textContent = `Last sign-in: ${formatted}`;
  prevBanner.hidden = false;
}

// ─── Submit handler ────────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const email    = emailInput.value.trim();
  const password = passwordInput.value;

  // Client-side validation
  let hasError = false;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailError.textContent = 'Please enter a valid email address.';
    emailInput.classList.add('invalid');
    hasError = true;
  }
  if (!password) {
    passwordError.textContent = 'Password is required.';
    passwordInput.classList.add('invalid');
    hasError = true;
  }
  if (hasError) return;

  setLoading(true);

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const json = await response.json();

    if (!response.ok) {
      // Handle field-level errors from zod
      if (json.errors) {
        if (json.errors.email) {
          emailError.textContent = json.errors.email[0];
          emailInput.classList.add('invalid');
        }
        if (json.errors.password) {
          passwordError.textContent = json.errors.password[0];
          passwordInput.classList.add('invalid');
        }
      } else {
        showFormError(json.message || 'Login failed. Please try again.');
      }
      return;
    }

    const { token, user, previousLoginAt } = json.data;

    // Persist token
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));

    // Show previous login to user before redirecting
    if (previousLoginAt) {
      showPrevLogin(previousLoginAt);
      // Brief pause to show the banner, then redirect
      setTimeout(() => redirectToDashboard(user), 2200);
    } else {
      redirectToDashboard(user);
    }

  } catch (err) {
    console.error('Login error:', err);
    showFormError('Unable to reach server. Please check your connection.');
  } finally {
    setLoading(false);
  }
});

// ─── Redirect after login ──────────────────────────────────────────────────────
function redirectToDashboard(user) {
  if (user.isSuperAdmin || !user.tenantId) {
    // Super Admin platform dashboard
    window.location.href = 'dashboard.html';
  } else {
    // Regular Company Admin / Tenant User dashboard
    window.location.href = 'company-dashboard.html';
  }
}

// ─── Check if already logged in ───────────────────────────────────────────────
(function checkSession() {
  const token = localStorage.getItem('auth_token');
  if (!token) return;

  fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((r) => {
      if (r.ok) {
        return r.json().then((d) => redirectToDashboard(d.data.user));
      }
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    })
    .catch(() => {
      localStorage.removeItem('auth_token');
    });
})();
