const wixApi = require('../services/wixApi.service');
const marketin = require('../services/marketin.service');
const knex = require('../db');
const tokenService = require('../services/token.service');

exports.syncProducts = async (req, res) => {
  try {
    const { siteId, brandId, apiKey } = req.body || {};

    // fetch access token for site or use provided siteId
    let tokenRow = null;
    if (siteId) tokenRow = await knex('wix_tokens').where({ site_id: siteId, is_active: true }).first();
    if (!tokenRow) {
      tokenRow = await knex('wix_tokens').where({ is_active: true }).first();
      if (!tokenRow) return res.status(400).json({ error: 'No Wix token found. Connect a Wix site first.' });
    }

    const effectiveSiteId = tokenRow.site_id;

    // Determine Market!N API key to use for sync (prefer request-provided; otherwise per-installation key)
    let apiKeyToUse = apiKey || null;
    if (!apiKeyToUse && tokenRow && tokenRow.marketin_api_key) {
      const { decrypt } = require('../utils/crypto');
      apiKeyToUse = decrypt(tokenRow.marketin_api_key);
    }

    // Use token service with automatic refresh on 401
    const results = await wixApi.withTokenRefresh(
      async (accessToken) => wixApi.getAllProducts(accessToken, { siteId: effectiveSiteId }),
      tokenService.getTokenHelpers(effectiveSiteId)
    );

    // Chunked sync: split results into manageable batches (e.g., 50 per request)
    const BATCH_SIZE = Number(process.env.PRODUCT_SYNC_BATCH_SIZE || 50);
    const chunks = [];
    for (let i = 0; i < results.length; i += BATCH_SIZE) chunks.push(results.slice(i, i + BATCH_SIZE));
    const syncResults = [];
    for (const chunk of chunks) {
      const syncResp = await marketin.bulkSyncProducts({ apiKey: apiKeyToUse, brandId, products: chunk });
      syncResults.push(syncResp);
      // store mappings for this chunk - best-effort
      const mappings = (syncResp && syncResp.products) || syncResp || [];
      for (const p of mappings) {
        const wix_id = p.wix_id || p.wixProductId || p.id || p.source_id || p.externalId;
        const marketin_id = p.id || p.marketin_id || p.market_id || p.marketinProductId || null;
        if (wix_id && marketin_id) {
          await knex('product_mappings').insert({ wix_product_id: String(wix_id), marketin_product_id: String(marketin_id), created_at: new Date(), updated_at: new Date() }).onConflict('wix_product_id').merge({ marketin_product_id: String(marketin_id), updated_at: new Date() });
        }
      }
      // If we have Redis/Bull worker enabled, optionally enqueue per-chunk jobs instead
      if (process.env.USE_QUEUE === 'true') {
        const { queue } = require('../worker/productSyncWorker');
        await queue.add('sync-chunk', { siteId: effectiveSiteId, brandId, apiKey, chunk });
      }
    }

    // mappings are handled per-chunk above

    res.json({ ok: true, count: results.length, details: syncResults });
  } catch (err) {
    console.error('syncProducts error', err?.response?.data || err.message || err);
    res.status(500).json({ error: 'Product sync failed', details: err?.response?.data || err.message || err });
  }
};
