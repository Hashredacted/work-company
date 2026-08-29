'use strict';

// Keys that must always be redacted from logs, error reports, and audit trails
const SENSITIVE_KEY_PATTERN = /password|secret|jwt|token|authorization|cookie|apiKey|api_key|privateKey|private_key|cvv|pin/i;
const SENSITIVE_FINANCIAL_KEYS = /accountNo|accountNumber|bankAccount|pan|aadhaar/i;

/**
 * Deeply sanitizes an object or array to remove sensitive credentials and PII.
 * Replaces values with '[REDACTED]' or masked suffixes.
 */
function redactSensitiveData(data, depth = 0) {
  if (depth > 10) return '[NESTED_MAX]'; // Prevent circular references
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    // Redact Bearer tokens embedded in string
    if (data.startsWith('Bearer ')) {
      return 'Bearer [REDACTED_JWT]';
    }
    // Redact MongoDB connection strings containing passwords
    if (data.includes('mongodb+srv://') || data.includes('mongodb://')) {
      return data.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)[^@]+(@)/i, '$1[REDACTED_DB_PASS]$2');
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item, depth + 1));
  }

  if (typeof data === 'object') {
    const clean = {};
    for (const [key, val] of Object.entries(data)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        clean[key] = '[REDACTED]';
      } else if (SENSITIVE_FINANCIAL_KEYS.test(key)) {
        if (typeof val === 'string' && val.length > 4) {
          clean[key] = `•••• •••• ${val.slice(-4)}`;
        } else {
          clean[key] = '[REDACTED_FIN]';
        }
      } else {
        clean[key] = redactSensitiveData(val, depth + 1);
      }
    }
    return clean;
  }

  return data;
}

module.exports = {
  redactSensitiveData,
};
