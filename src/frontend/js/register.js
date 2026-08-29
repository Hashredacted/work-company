'use strict';

const API_BASE = 'http://localhost:5000/api';

// ─── DOM References ──────────────────────────────────────────────────────────
const form                 = document.getElementById('register-form');
const companyName          = document.getElementById('companyName');
const companyEmail         = document.getElementById('companyEmail');
const companyPhone         = document.getElementById('companyPhone');
const businessType         = document.getElementById('businessType');
const companyGst           = document.getElementById('companyGst');
const companyLicense       = document.getElementById('companyLicense');
const companyCity          = document.getElementById('companyCity');
const companyState         = document.getElementById('companyState');
const companyPincode       = document.getElementById('companyPincode');
const companyAddress       = document.getElementById('companyAddress');
const adminName            = document.getElementById('adminName');
const adminEmail           = document.getElementById('adminEmail');
const adminPassword        = document.getElementById('adminPassword');
const adminConfirmPassword = document.getElementById('adminConfirmPassword');

// Error Elements
const nameError                 = document.getElementById('name-error');
const emailError                = document.getElementById('email-error');
const phoneError                = document.getElementById('phone-error');
const gstError                  = document.getElementById('gst-error');
const licenseError              = document.getElementById('license-error');
const cityError                 = document.getElementById('city-error');
const stateError                = document.getElementById('state-error');
const pincodeError              = document.getElementById('pincode-error');
const addressError              = document.getElementById('address-error');
const adminNameError            = document.getElementById('adminName-error');
const adminEmailError           = document.getElementById('adminEmail-error');
const adminPasswordError        = document.getElementById('adminPassword-error');
const adminConfirmPasswordError = document.getElementById('adminConfirmPassword-error');
const formError                 = document.getElementById('form-error');
const formSuccess               = document.getElementById('form-success');

// Buttons
const submitBtn    = document.getElementById('submit-btn');
const btnText      = document.getElementById('btn-text');
const btnSpinner   = document.getElementById('btn-spinner');
const quickFillBtn = document.getElementById('quick-fill-btn');
const togglePw1    = document.getElementById('toggle-pw-1');
const togglePw2    = document.getElementById('toggle-pw-2');

// ─── Password Visibility Toggles ─────────────────────────────────────────────
if (togglePw1) {
  togglePw1.addEventListener('click', () => {
    const isHidden = adminPassword.type === 'password';
    adminPassword.type = isHidden ? 'text' : 'password';
    togglePw1.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
  });
}

if (togglePw2) {
  togglePw2.addEventListener('click', () => {
    const isHidden = adminConfirmPassword.type === 'password';
    adminConfirmPassword.type = isHidden ? 'text' : 'password';
    togglePw2.setAttribute('aria-label', isHidden ? 'Hide confirm password' : 'Show confirm password');
  });
}

// ─── GSTIN Auto-Formatting ───────────────────────────────────────────────────
if (companyGst) {
  companyGst.addEventListener('input', () => {
    companyGst.value = companyGst.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 15);
  });
}

// ─── Quick Fill Demo Helper ──────────────────────────────────────────────────
if (quickFillBtn) {
  quickFillBtn.addEventListener('click', () => {
    const rand = Math.floor(1000 + Math.random() * 9000);
    companyName.value          = `Apex Enterprises ${rand} Ltd`;
    companyEmail.value         = `contact${rand}@apexenterprises.in`;
    companyPhone.value         = `+91 98201 ${rand}`;
    businessType.value         = 'Retail & Wholesale';
    companyGst.value           = `27AABCA${rand}F1Z5`;
    companyLicense.value       = `REG-APEX-${rand}`;
    companyCity.value          = 'Mumbai';
    companyState.value         = 'Maharashtra';
    companyPincode.value       = '400001';
    companyAddress.value       = `Plot ${rand % 100}, Phase 2, Commercial Complex, Andheri East`;
    adminName.value            = 'Rohan Sharma';
    adminEmail.value           = `admin${rand}@apexenterprises.in`;
    adminPassword.value        = 'Password@123';
    adminConfirmPassword.value = 'Password@123';

    clearErrors();
  });
}

// ─── Real-time Input Validation Reset ────────────────────────────────────────
const allInputs = [
  { el: companyName, err: nameError },
  { el: companyEmail, err: emailError },
  { el: companyPhone, err: phoneError },
  { el: companyGst, err: gstError },
  { el: companyLicense, err: licenseError },
  { el: companyCity, err: cityError },
  { el: companyState, err: stateError },
  { el: companyPincode, err: pincodeError },
  { el: companyAddress, err: addressError },
  { el: adminName, err: adminNameError },
  { el: adminEmail, err: adminEmailError },
  { el: adminPassword, err: adminPasswordError },
  { el: adminConfirmPassword, err: adminConfirmPasswordError },
];

allInputs.forEach(({ el, err }) => {
  if (el) {
    el.addEventListener('input', () => {
      if (err) err.textContent = '';
      el.classList.remove('invalid');
      formError.hidden = true;
    });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function setLoading(state) {
  submitBtn.disabled = state;
  btnText.textContent = state ? 'Provisioning your workspace…' : 'Create Company Account & Start 7-Day Free Trial →';
  btnSpinner.hidden = !state;
}

function clearErrors() {
  if (formError) {
    formError.hidden = true;
    formError.textContent = '';
  }
  if (formSuccess) {
    formSuccess.style.display = 'none';
  }
  document.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
  document.querySelectorAll('.field-input').forEach((el) => el.classList.remove('invalid'));
}

// ─── Submit Handler ──────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  const payload = {
    name:         companyName.value.trim(),
    email:        companyEmail.value.trim(),
    phone:        companyPhone.value.trim() || undefined,
    businessType: businessType.value.trim() || 'Retail & Wholesale',
    gst:          companyGst.value.trim() || undefined,
    license:      companyLicense.value.trim() || undefined,
    city:         companyCity.value.trim() || undefined,
    state:        companyState.value.trim() || undefined,
    pincode:      companyPincode.value.trim() || undefined,
    address:      companyAddress.value.trim() || undefined,
    adminName:    adminName.value.trim(),
    adminEmail:   adminEmail.value.trim(),
    adminPassword: adminPassword.value,
  };

  const confirmPassword = adminConfirmPassword.value;
  let hasError = false;

  // 1. Company Name
  if (!payload.name || payload.name.length < 2) {
    nameError.textContent = 'Company name must be at least 2 characters.';
    companyName.classList.add('invalid');
    hasError = true;
  }

  // 2. Company Email
  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    emailError.textContent = 'A valid company email address is required.';
    companyEmail.classList.add('invalid');
    hasError = true;
  }

  // 3. GSTIN (if provided)
  if (payload.gst && payload.gst.length > 0 && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(payload.gst)) {
    gstError.textContent = 'Enter a valid 15-digit Indian GSTIN (e.g. 27AABCA1234F1Z5).';
    companyGst.classList.add('invalid');
    hasError = true;
  }

  // 4. Admin Name
  if (!payload.adminName || payload.adminName.length < 2) {
    adminNameError.textContent = 'Admin full name must be at least 2 characters.';
    adminName.classList.add('invalid');
    hasError = true;
  }

  // 5. Admin Email
  if (!payload.adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.adminEmail)) {
    adminEmailError.textContent = 'A valid admin login email is required.';
    adminEmail.classList.add('invalid');
    hasError = true;
  }

  // 6. Admin Password
  if (!payload.adminPassword || payload.adminPassword.length < 6) {
    adminPasswordError.textContent = 'Password must be at least 6 characters.';
    adminPassword.classList.add('invalid');
    hasError = true;
  }

  // 7. Confirm Password
  if (payload.adminPassword !== confirmPassword) {
    adminConfirmPasswordError.textContent = 'Passwords do not match.';
    adminConfirmPassword.classList.add('invalid');
    hasError = true;
  }

  if (hasError) {
    return;
  }

  setLoading(true);

  try {
    const response = await fetch(`${API_BASE}/companies/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const json = await response.json();

    if (!response.ok) {
      if (json.errors && typeof json.errors === 'object') {
        const errorMap = {
          name: { el: companyName, err: nameError },
          email: { el: companyEmail, err: emailError },
          phone: { el: companyPhone, err: phoneError },
          gst: { el: companyGst, err: gstError },
          license: { el: companyLicense, err: licenseError },
          city: { el: companyCity, err: cityError },
          state: { el: companyState, err: stateError },
          pincode: { el: companyPincode, err: pincodeError },
          address: { el: companyAddress, err: addressError },
          adminName: { el: adminName, err: adminNameError },
          adminEmail: { el: adminEmail, err: adminEmailError },
          adminPassword: { el: adminPassword, err: adminPasswordError },
        };

        let displayedFieldErr = false;
        Object.keys(json.errors).forEach((key) => {
          const mapping = errorMap[key];
          const msgs = Array.isArray(json.errors[key]) ? json.errors[key] : [json.errors[key]];
          if (mapping && mapping.err) {
            mapping.err.textContent = msgs[0];
            if (mapping.el) mapping.el.classList.add('invalid');
            displayedFieldErr = true;
          }
        });

        if (!displayedFieldErr || json.message) {
          formError.textContent = json.message || 'Validation error during registration.';
          formError.hidden = false;
        }
      } else {
        formError.textContent = json.message || 'Registration failed. Please check your details.';
        formError.hidden = false;
      }
      return;
    }

    const { token, user, tenant } = json.data;

    // Save active session
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('auth_tenant', JSON.stringify(tenant));

    // Show success feedback
    if (formSuccess) {
      formSuccess.style.display = 'block';
    }

    // Redirect to company dashboard
    setTimeout(() => {
      window.location.href = 'company-dashboard.html';
    }, 1000);

  } catch (err) {
    console.error('Registration network error:', err);
    formError.textContent = 'Unable to reach the server. Please verify your connection and try again.';
    formError.hidden = false;
  } finally {
    setLoading(false);
  }
});
