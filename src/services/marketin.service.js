const axios = require('axios');

const marketinClient = axios.create({
  baseURL: process.env.MARKETIN_API_URL,
  headers: {
    'Authorization': `Bearer ${process.env.MARKETIN_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

const bulkSyncProducts = async ({ apiKey, brandId, products }) => {
  // use provided apiKey or default
  const client = axios.create({ baseURL: process.env.MARKETIN_API_URL, headers: { Authorization: `Bearer ${apiKey || process.env.MARKETIN_API_KEY}`, 'Content-Type': 'application/json' } });
  const endpoint = `/sdk/wix/bulk-sync/`;
  try {
    // limit size per request to avoid payload too large; let caller handle chunking
    const resp = await client.post(endpoint, { brand_id: brandId, products });
    return resp.data;
  } catch (err) {
    console.error('bulkSyncProducts error', err?.response?.data || err.message || err);
    throw err;
  }
};

const sendConversion = async ({ apiKey, siteId, orderId, amount, currency, affiliateId }) => {
  const client = axios.create({ baseURL: process.env.MARKETIN_API_URL, headers: { Authorization: `Bearer ${apiKey || process.env.MARKETIN_API_KEY}`, 'Content-Type': 'application/json' } });
  const endpoint = `/sdk/conversions/`;
  try {
    const payload = { site_id: siteId, order_id: orderId, amount, currency, affiliate_id: affiliateId };
    const resp = await client.post(endpoint, payload);
    return resp.data;
  } catch (err) {
    console.error('sendConversion error', err?.response?.data || err.message || err);
    throw err;
  }
};

module.exports = {
  client: marketinClient
  , bulkSyncProducts
  , sendConversion
};
