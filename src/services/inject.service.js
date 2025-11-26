const wixApi = require('./wixApi.service');
const knex = require('../db/knex');

// Implement injecting a small Market!N snippet into the Wix site's head
const injectPixel = async (siteId, accessToken) => {
  const businessId = siteId;
  // Compose the script injection content
  const scriptTag = `<script defer src=\"https://cdn.marketin.com/sdk.js\" data-marketin-business-id=\"${businessId}\"></script>`;
  const inlineScript = `<script>(function(m){m.MARKETIN=m.MARKETIN||function(){(m.MARKETIN.q=m.MARKETIN.q||[]).push(arguments);};})(window);MARKETIN("page_view");</script>`;
  const content = `${scriptTag}\n${inlineScript}`;

  try {
    const resp = await wixApi.injectHeadScript({ siteId, token: accessToken, content });
    // Check response for success; Wix may return an object or created ID.
    const ok = !!resp && (resp.ok || resp.id || resp.insertedId);

    // Store result in DB - mark as injected
    await knex('wix_tokens').where({ site_id: siteId }).update({ injected: !!ok, injected_at: new Date() });

    return { ok: !!ok, details: resp };
  } catch (err) {
    console.error('injectPixel error', err?.response?.data || err.message || err);
    // Update DB as failed attempt
    try {
      await knex('wix_tokens').where({ site_id: siteId }).update({ injected: false, injected_at: null });
    } catch (e) {
      console.error('injectPixel DB update failed', e);
    }
    throw err;
  }
};

module.exports = {
  injectPixel,
};
