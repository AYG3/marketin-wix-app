#!/usr/bin/env node
/**
 * Validate Market!N API key by calling the Market!N health endpoint via the app service client
 * Usage: node scripts/validate-marketin-key.js <apiKey> [apiUrl]
 */

const { validateApiKey } = require('../src/services/marketin.service');

const apiKey = process.argv[2] || process.env.MARKETIN_API_KEY;
const apiUrl = process.argv[3] || process.env.MARKETIN_API_URL;

if (!apiKey) {
  console.error('API key is required. Usage: node scripts/validate-marketin-key.js <apiKey>');
  process.exit(1);
}

(async () => {
  try {
    const result = await validateApiKey(apiKey);
    console.log('Validation result:', result);
    process.exit(0);
  } catch (err) {
    console.error('Error validating API key:', err?.message || err);
    process.exit(2);
  }
})();
