const knex = require('../db');
const wixApi = require('../services/wixApi.service');
const marketin = require('../services/marketin.service');
const { decrypt } = require('../utils/crypto');

exports.handleProductUpdated = async (req, res) => {
  try {
    const payload = req.body;
    // Wix webhook payloads may contain the product object or productId
    const wixProduct = payload.product || payload;
    const wixId = wixProduct.id || wixProduct._id || wixProduct.productId || payload.productId || payload.product_id || null;
    if (!wixId) return res.status(400).json({ error: 'Missing wix product id' });

    // get mapping
    const mapping = await knex('product_mappings').where({ wix_product_id: wixId }).first();
    // Find access token
    const tokenRow = await knex('wix_tokens').whereNotNull('access_token').first();
    if (!tokenRow) return res.status(400).json({ error: 'No wix token found' });
    const accessToken = tokenRow.access_token ? (process.env.ENCRYPTION_KEY || process.env.JWT_SECRET ? decrypt(tokenRow.access_token) : tokenRow.access_token) : null;

    // Option A: send single update request to Market!N API for product
    const toSend = [wixId].map((id) => ({ id: wixProduct.id || id, title: wixProduct.name || wixProduct.title || '', sku: wixProduct.sku || '' }));
    // marketin API expects bulk endpoint - call bulk with single product
    await marketin.bulkSyncProducts({ brandId: req.body.brandId || null, apiKey: req.body.apiKey || null, products: toSend });

    // Update mapping if new mapping returned
    // not implemented: parse marketin response for mapping

    res.json({ ok: true });
  } catch (err) {
    console.error('handleProductUpdated error', err?.response?.data || err.message || err);
    res.status(500).json({ error: 'product update processing failed' });
  }
};

exports.handleProductDeleted = async (req, res) => {
  try {
    const payload = req.body;
    const wixId = payload.productId || payload.id || null;
    if (!wixId) return res.status(400).json({ error: 'Missing wix product id' });
    const mapping = await knex('product_mappings').where({ wix_product_id: wixId }).first();
    if (mapping && mapping.marketin_product_id) {
      // try to delete product from marketin via SDK - for now assume a delete endpoint
      try {
        const client = require('../services/marketin.service');
        // We assume Market!N has a delete API at DELETE /sdk/wix/product/:id (placeholder)
        await client.client.delete(`/sdk/wix/product/${mapping.marketin_product_id}`);
      } catch (e) {
        console.error('marketin delete product failed', e?.response?.data || e.message || e);
      }
    }
    await knex('product_mappings').where({ wix_product_id: wixId }).del();
    res.json({ ok: true });
  } catch (err) {
    console.error('handleProductDeleted error', err?.response?.data || err.message || err);
    res.status(500).json({ error: 'product delete processing failed' });
  }
};
