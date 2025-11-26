const wixApi = require('./wixApi.service');
const knex = require('../db');
const { decrypt } = require('../utils/crypto');

// Implement injecting a small Market!N snippet into the Wix site's head
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const injectPixel = async (siteId, accessToken) => {
  const businessId = siteId;
  // Compose the script injection content
  const scriptTag = `<script defer src=\"https://cdn.marketin.com/sdk.js\" data-marketin-business-id=\"${businessId}\"></script>`;
  const inlineScript = `<script>(function(m){m.MARKETIN=m.MARKETIN||function(){(m.MARKETIN.q=m.MARKETIN.q||[]).push(arguments);};})(window);MARKETIN("page_view");</script>`;
  const content = `${scriptTag}\n${inlineScript}`;

  // If accessToken missing, try to fetch from DB and decrypt
  let token = accessToken;
  if (!token) {
    const row = await knex('wix_tokens').where({ site_id: siteId }).first();
    if (!row) throw new Error('No token found for site');
    token = decrypt(row.access_token);
  }

  // Implement retry logic with exponential backoff
  const MAX_RETRIES = 3;
  let attempt = 0;
  let lastErr = null;
  while (attempt < MAX_RETRIES) {
    attempt += 1;
    // Update attempt count in DB
    try { await knex('wix_tokens').where({ site_id: siteId }).increment('injection_attempts', 1); } catch (e) { /* ignore */ }
    try {
      const resp = await wixApi.injectHeadScript({ siteId, token, content });
      const ok = !!resp && (resp.ok || resp.id || resp.insertedId);
      if (ok) {
        // success - update DB
        await knex('wix_tokens').where({ site_id: siteId }).update({ injected: true, injected_at: new Date(), injection_status: 'success' });
        return { ok: true, details: resp };
      }
      lastErr = new Error('Injection did not indicate success');
    } catch (err) {
      lastErr = err;
    }

    // if not last attempt, wait before retrying
    if (attempt < MAX_RETRIES) {
      const backoff = 200 * Math.pow(2, attempt - 1);
      await sleep(backoff);
    }
  }

  // All attempts failed - write failed status
  try {
    await knex('wix_tokens').where({ site_id: siteId }).update({ injected: false, injection_status: 'failed' });
  } catch (e) { /* ignore */ }
  throw lastErr || new Error('injectPixel failed');
};

module.exports = {
  injectPixel,
};
