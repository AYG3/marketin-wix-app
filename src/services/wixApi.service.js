const axios = require('axios');
require('dotenv').config();
let wixSdk = null;
try { wixSdk = require('@wix/sdk'); } catch (e) { wixSdk = null; }

const exchangeCodeForToken = async (code) => {
  // If WIX_CLIENT_SECRET is present, perform a real exchange with Wix API
  const clientId = process.env.WIX_CLIENT_ID;
  const clientSecret = process.env.WIX_CLIENT_SECRET;
  const redirectUri = process.env.WIX_REDIRECT_URI;

  if (!clientSecret) {
    // No client secret set - return a mocked response for local development
    return {
      client_id: clientId,
      access_token: `mock_access_token_${code}`,
      refresh_token: `mock_refresh_token_${code}`,
      expires_in: 3600,
      expires_at: new Date(Date.now() + 3600 * 1000),
      site_id: 'mock-site-id',
      instance_id: 'mock-instance-id',
    };
  }

  // Real exchange
  try {
    const resp = await axios.post('https://www.wix.com/oauth/access', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      },
    });
    // Wix returns typical oauth fields - map them
    const data = resp.data;
    return {
      client_id: clientId,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
      site_id: data.site_id || null,
      instance_id: data.instance_id || null,
    };
  } catch (err) {
    console.error('wix exchange token error', err?.response?.data || err.message || err);
    throw err;
  }
};

const injectHeadScript = async ({ siteId, token, content }) => {
  // Placeholder implementation for injecting head script into a Wix site
  // Wix Admin APIs typically require an Authorization header with the access token.
  // This is a best-effort emulation using a Wix-like endpoint pattern.
  // Prefer using Wix SDK if available
  if (wixSdk && typeof wixSdk.createClient === 'function') {
    try {
      // create a client with OAuthStrategy using the provided token (if supported by the SDK)
      // Note: This is a best-effort integration; adjust based on the SDK version and modules available.
      const { OAuthStrategy, createClient } = wixSdk;
      const client = createClient({ auth: OAuthStrategy({ accessToken: token }) });
      if (client.sites && client.sites.htmlInjections && typeof client.sites.htmlInjections.create === 'function') {
        const resp = await client.sites.htmlInjections.create(siteId, { html: content, position: 'head' });
        return resp;
      }
    } catch (err) {
      console.error('wix sdk injectHeadScript error', err?.response?.data || err.message || err);
      // fallback to REST below
    }
  }

  // Fallback: HTTP POST to Wix Admin REST API for HTML injection into the site head
  const endpoint = `https://www.wixapis.com/sites/v1/sites/${siteId}/html-injections`;
  try {
    const resp = await axios.post(endpoint, { content, position: 'head' }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    });
    return resp.data;
  } catch (err) {
    // Log the response for better debugging, but keep throwing to the caller
    console.error('wixApi.injectHeadScript error', err?.response?.data || err.message || err);
    throw err;
  }
};

// Fetch all products with pagination from Wix Stores API
const normalizeWixProduct = (p) => {
  // Wix product object is rich; this normalizer attempts to extract the fields we need
  const id = p.id || p._id || p._uid || p.productId || p.uid || ''; // primary key
  const title = p.name || p.title || p.productName || '';

  // Images: Wix may return multiple images in different arrays
  let image = null;
  if (Array.isArray(p.media) && p.media.length) image = p.media[0].url || image;
  if (!image && Array.isArray(p.images) && p.images.length) image = p.images[0].url || image;
  if (!image && p.image) image = p.image;

  // Price / currency: single product may have price, priceRange, or variant prices
  const price = (p.price && p.price.amount) || (p.priceRange && p.priceRange.min) || null;
  const currency = (p.price && p.price.currency) || p.currency || (p.priceRange && p.priceRange.currency) || 'USD';

  // Inventory: product inventory might be at product.level or per variant
  const inventoryQuantity = (p.inventory && p.inventory.availableQuantity) || p.stock || 0;

  // Normalize variants: align common fields - id, sku, price, inventory, attributes
  const variants = (p.variants || []).map((v) => {
    const vid = v.id || v._id || v.sku || null;
    const sku = v.sku || v.skuCode || null;
    const vPrice = (v.price && v.price.amount) || v.price || null;
    const vCurrency = (v.price && v.price.currency) || currency;
    const inventoryQty = (v.inventory && v.inventory.availableQuantity) || v.stock || null;
    // attributes: Wix variant options may be stored in optionValues
    const attributes = (v.optionValues || []).map((ov) => ({ id: ov.optionId || ov.optionKey, label: ov.value }));
    return { id: vid, sku, price: vPrice, currency: vCurrency, inventoryQuantity: inventoryQty, attributes };
  });

  // SKU fallback: product level SKU or first variant sku
  const sku = p.sku || (variants[0] && variants[0].sku) || null;

  return { id, title, sku, price, currency, inventoryQuantity, image, variants };
};

const getAllProducts = async (accessToken, { siteId, limit = 50 } = {}) => {
  let products = [];
  let offset = 0;
  while (true) {
    try {
      const body = { limit, offset };
      const endpoint = `https://www.wixapis.com/stores/v1/products/query`;
      const resp = await axios.post(endpoint, body, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      });
      const data = resp.data || {};
      const items = data.products || data.items || data.results || [];
      products.push(...items);
      if (items.length < limit) break;
      offset += items.length;
    } catch (err) {
      // If next token or paging style differs, attempt fallback to nextPageToken
      const errMsg = err?.response?.data || err.message || err;
      console.error('getAllProducts error', errMsg);
      throw err;
    }
  }

  // Normalize
  const normalized = products.map(normalizeWixProduct);
  return normalized;
};

module.exports = {
  exchangeCodeForToken,
  injectHeadScript,
  getAllProducts,
};
