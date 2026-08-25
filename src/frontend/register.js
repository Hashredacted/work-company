'use strict';

const API_BASE = 'http://localhost:5000/api';

const form           = document.getElementById('register-form');
const companyName    = document.getElementById('companyName');
const companyEmail   = document.getElementById('companyEmail');
const companyPhone   = document.getElementById('companyPhone');
const companyGst     = document.getElementById('companyGst');
const companyLicense = document.getElementById('companyLicense');
const companyAddress = document.getElementById('companyAddress');
const adminName      = document.getElementById('adminName');
const adminEmail     = document.getElementById('adminEmail');
const adminPassword  = document.getElementById('adminPassword');

const nameError          = document.getElementById('name-error');
const emailError         = document.getElementById('email-error');
const adminNameError     = document.getElementById('adminName-error');
const adminEmailError    = document.getElementById('adminEmail-error');
const adminPasswordError = document.getElementById('adminPassword-error');
const formError          = document.getElementById('form-error');

const submitBtn  = document.getElementById('submit-btn');
const btnText    = document.getElementById('btn-text');
const btnSpinner = document.getElementById('btn-spinner');

function setLoading(state) {
  submitBtn.disabled = state;
  btnText.textContent = state ? 'Setting up your company…' : 'Create Company Account';
  btnSpinner.hidden = !state;
}

function clearErrors() {
  formError.hidden = true;
  formError.textContent = '';
  document.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
  document.querySelectorAll('.field-input').forEach((el) => el.classList.remove('invalid'));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const payload = {
    name:          companyName.value.trim(),
    email:         companyEmail.value.trim(),
    phone:         companyPhone.value.trim() || undefined,
    gst:           companyGst.value.trim() || undefined,
    license:       companyLicense.value.trim() || undefined,
    address:       companyAddress.value.trim() || undefined,
    adminName:     adminName.value.trim(),
    adminEmail:    adminEmail.value.trim(),
    adminPassword: adminPassword.value,
  };

  let hasError = false;

  if (!payload.name || payload.name.length < 2) {
    nameError.textContent = 'Company name must be at least 2 characters.';
    companyName.classList.add('invalid');
    hasError = true;
  }

  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    emailError.textContent = 'Valid company email is required.';
    companyEmail.classList.add('invalid');
    hasError = true;
  }

  if (!payload.adminName || payload.adminName.length < 2) {
    adminNameError.textContent = 'Admin name is required.';
    adminName.classList.add('invalid');
    hasError = true;
  }

  if (!payload.adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.adminEmail)) {
    adminEmailError.textContent = 'Valid admin email is required.';
    adminEmail.classList.add('invalid');
    hasError = true;
  }

  if (!payload.adminPassword || payload.adminPassword.length < 6) {
    adminPasswordError.textContent = 'Password must be at least 6 characters.';
    adminPassword.classList.add('invalid');
    hasError = true;
  }

  if (hasError) return;

  setLoading(true);

  try {
    const response = await fetch(`${API_BASE}/companies/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await response.json();

    if (!response.ok) {
      if (json.errors) {
        if (json.errors.email) {
          emailError.textContent = json.errors.email[0];
          companyEmail.classList.add('invalid');
        }
        if (json.errors.adminEmail) {
          adminEmailError.textContent = json.errors.adminEmail[0];
          adminEmail.classList.add('invalid');
        }
      } else {
        formError.textContent = json.message || 'Registration failed.';
        formError.hidden = false;
      }
      return;
    }

    const { token, user, tenant } = json.data;

    // Save session
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('auth_tenant', JSON.stringify(tenant));

    // Redirect to company dashboard
    window.location.href = 'company-dashboard.html';

  } catch (err) {
    console.error('Registration error:', err);
    formError.textContent = 'Unable to reach server. Please check your connection.';
    formError.hidden = false;
  } finally {
    setLoading(false);
  }
});
