'use strict';

const crypto = require('crypto');

// ─── Key Derivation ─────────────────────────────────────────────────────────
// Derive 256-bit key (32 bytes) from ENCRYPTION_KEY or JWT_SECRET using HKDF
const MASTER_SECRET = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'workspace-enterprise-security-master-key-2026';
const KEY_SALT = 'workspace-encryption-salt-2026-secure';
const BLIND_INDEX_SALT = 'workspace-blind-index-salt-2026-secure';

// 32-byte encryption key
const ENCRYPTION_KEY = crypto.hkdfSync('sha256', MASTER_SECRET, KEY_SALT, 'aes-256-gcm-key', 32);
// 32-byte blind index HMAC key
const BLIND_INDEX_KEY = crypto.hkdfSync('sha256', MASTER_SECRET, BLIND_INDEX_SALT, 'hmac-blind-index-key', 32);

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard for AES-GCM (96 bits)
const PREFIX = 'enc:v1:';

/**
 * Encrypts plaintext string using AES-256-GCM with authenticated tags.
 * Returns formatted ciphertext: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 * If value is null, undefined, or empty, returns original value.
 */
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return plaintext;
  }
  const text = String(plaintext);
  // Already encrypted
  if (text.startsWith(PREFIX)) {
    return text;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM ciphertext.
 * Returns decrypted plaintext string.
 * If input is not in enc:v1 format, returns input as-is for backward compatibility.
 */
function decrypt(ciphertext) {
  if (ciphertext === null || ciphertext === undefined || ciphertext === '') {
    return ciphertext;
  }
  const text = String(ciphertext);
  if (!text.startsWith(PREFIX)) {
    return text;
  }

  try {
    const parts = text.slice(PREFIX.length).split(':');
    if (parts.length !== 3) {
      return text;
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // If decryption fails (e.g. key changed or corrupted ciphertext), return safe empty/original
    console.error('[Encryption] Decryption failed:', err.message);
    return text;
  }
}

/**
 * Computes a deterministic HMAC-SHA-256 blind index hash for searchable encrypted fields.
 * Enables exact-match indexed queries without storing or revealing plaintext.
 */
function blindIndex(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  // Decrypt first if already ciphertext
  const raw = decrypt(String(value)).trim();
  if (!raw) return null;
  return crypto.createHmac('sha256', BLIND_INDEX_KEY).update(raw.toLowerCase()).digest('hex');
}

/**
 * Masks sensitive financial strings (e.g. Account No: •••• •••• 5678, PAN: ••••••123A).
 */
function mask(value, visibleSuffix = 4) {
  if (!value) return '';
  const raw = decrypt(String(value)).trim();
  if (raw.length <= visibleSuffix) return raw;
  const suffix = raw.slice(-visibleSuffix);
  return `•••• •••• ${suffix}`;
}

/**
 * Constant-time string comparison to protect against timing attacks.
 */
function timingSafeEqualStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  encrypt,
  decrypt,
  blindIndex,
  mask,
  timingSafeEqualStrings,
};
