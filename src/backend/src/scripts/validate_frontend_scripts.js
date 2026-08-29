'use strict';

const fs = require('fs');
const path = require('path');

const files = [
  'inv-dashboard.html',
  'inv-products.html',
  'inv-suppliers.html',
  'inv-customers.html',
  'inv-payments.html',
  'inv-reports.html',
  'users.html',
  'company-dashboard.html',
  'dashboard.html',
];

let hasError = false;

for (const f of files) {
  const filePath = path.join(__dirname, '../../frontend/html', f);
  if (!fs.existsSync(filePath)) continue;

  const content = fs.readFileSync(filePath, 'utf8');
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let idx = 0;

  while ((match = scriptRegex.exec(content)) !== null) {
    idx++;
    const fullTag = match[0];
    const scriptCode = match[1];

    if (/src\s*=/i.test(fullTag.split('>')[0])) {
      continue;
    }

    try {
      new Function(scriptCode);
      console.log(`✅ ${f} (Script ${idx}): Syntax Valid`);
    } catch (err) {
      console.error(`❌ ${f} (Script ${idx}) SYNTAX ERROR:`, err.message);
      hasError = true;
    }
  }
}

if (!hasError) {
  console.log('\nALL FRONTEND SCRIPTS PARSE AND COMPILE CLEANLY! ✅');
  process.exit(0);
} else {
  process.exit(1);
}
