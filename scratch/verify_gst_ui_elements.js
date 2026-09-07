const fs = require('fs');
const html = fs.readFileSync('src/frontend/html/inv-invoice.html', 'utf8');

const checks = [
  'id="seg-mode-AFTER_DISCOUNT"',
  'id="seg-mode-BEFORE_DISCOUNT"',
  'id="seg-mode-INCLUSIVE"',
  'function setGstDiscountMode(',
  'function onGstDiscountModeChange(',
  'id="tot-gst-mode-select"',
  'id="set-default-gst-mode"',
  'id="table-gst-formula-strip"',
  'id="th-price-header"',
  'id="th-tax-header"'
];

let allPassed = true;
checks.forEach(c => {
  const found = html.includes(c);
  console.log(c, '=>', found ? '✅ FOUND' : '❌ MISSING');
  if (!found) allPassed = false;
});

if (allPassed) {
  console.log('\nAll UI elements verified successfully!');
} else {
  process.exit(1);
}
