const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12; // 96 bits for GCM

const getKey = () => {
  const keySource = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!keySource) {
    console.warn('ENCRYPTION_KEY or JWT_SECRET not set, token encryption will be in plaintext (not secure)');
    return null;
  }
  // Derive a 32-byte key from the secret using sha256
  return crypto.createHash('sha256').update(String(keySource)).digest();
};

const encrypt = (text) => {
  const key = getKey();
  if (!key) return text; // no encryption
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // return base64 iv:auth:tag
  return `${iv.toString('base64')}:${encrypted.toString('base64')}:${authTag.toString('base64')}`;
};

const decrypt = (data) => {
  const key = getKey();
  if (!key) return data; // no encryption
  if (!data) return null;
  try {
    const [ivb, encryptedB, authTagB] = String(data).split(':');
    const iv = Buffer.from(ivb, 'base64');
    const encrypted = Buffer.from(encryptedB, 'base64');
    const authTag = Buffer.from(authTagB, 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('decrypt error', err);
    return null;
  }
};

module.exports = { encrypt, decrypt };
