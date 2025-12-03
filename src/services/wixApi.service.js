const axios = require('axios');
require('dotenv').config();
let wixSdk = null;
try { wixSdk = require('@wix/sdk'); } catch (e) { wixSdk = null; }

// Token refresh and retry configuration
const MAX_RETRIES = 1;

/**
 * Refresh an access token using the refresh token
 * @param {string} refreshToken - The refresh token (decrypted)
 * @returns {Object} - New token data { access_token, refresh_token, expires_in, expires_at }
 */
const refreshAccessToken = async (refreshToken) => {
  const clientId = process.env.WIX_CLIENT_ID;
  const clientSecret = process.env.WIX_CLIENT_SECRET;

  if (!clientSecret) {
    // Mock response for development
    console.warn('WIX_CLIENT_SECRET not set, returning mock refresh response');
    return {
      access_token: `mock_refreshed_token_${Date.now()}`,
      refresh_token: refreshToken,
      expires_in: 3600,
      expires_at: new Date(Date.now() + 3600 * 1000),
    };
  }

  try {
    // Wix OAuth requires JSON body, not URL params
    const resp = await axios.post('https://www.wixapis.com/oauth/access', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = resp.data;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken, // Wix may not return new refresh token
      expires_in: data.expires_in,
      expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    };
  } catch (err) {
    console.error('refreshAccessToken error:', err?.response?.data || err.message);
    throw err;
  }
};

/**
 * Helper to make API calls with automatic token refresh on 401
 * @param {Function} apiCall - Function that makes the API call, receives accessToken
 * @param {Object} options - { siteId, getTokenFn, updateTokenFn }
 */
const withTokenRefresh = async (apiCall, { siteId, getTokenFn, updateTokenFn }) => {
  let retries = 0;
  
  while (retries <= MAX_RETRIES) {
    try {
      const { accessToken } = await getTokenFn(siteId);
      return await apiCall(accessToken);
    } catch (err) {
      const status = err?.response?.status;
      
      // If 401 and we haven't retried yet, try to refresh
      if (status === 401 && retries < MAX_RETRIES) {
        console.log(`[wixApi] Got 401, attempting token refresh for site ${siteId}`);
        try {
          const { refreshToken } = await getTokenFn(siteId);
          if (!refreshToken) {
            throw new Error('No refresh token available');
          }
          
          const newTokens = await refreshAccessToken(refreshToken);
          await updateTokenFn(siteId, newTokens);
          console.log(`[wixApi] Token refreshed successfully for site ${siteId}`);
          retries++;
          continue;
        } catch (refreshErr) {
          console.error('[wixApi] Token refresh failed:', refreshErr.message);
          throw err; // Throw original error
        }
      }
      
      throw err;
    }
  }
};

/**
 * Remove head script injection from a Wix site
 * Called during uninstall cleanup
 */
const removeHeadScript = async ({ siteId, token, scriptId }) => {
  // If we have a script ID, try to delete it
  if (scriptId) {
    const endpoint = `https://www.wixapis.com/sites/v1/sites/${siteId}/html-injections/${scriptId}`;
    try {
      await axios.delete(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });
      return { ok: true };
    } catch (err) {
      console.error('wixApi.removeHeadScript error:', err?.response?.data || err.message);
      // Don't throw - uninstall should continue even if this fails
      return { ok: false, error: err.message };
    }
  }
  
  // Without script ID, we can't remove specific script
  return { ok: false, error: 'No script ID provided' };
};

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

  // Real exchange - use JSON body format for Wix OAuth API
  try {
    const resp = await axios.post('https://www.wixapis.com/oauth/access', {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Wix returns typical oauth fields - map them
    const data = resp.data;
    console.log('[wixApi] Token exchange response:', JSON.stringify({ 
      has_access_token: !!data.access_token,
      has_refresh_token: !!data.refresh_token,
      expires_in: data.expires_in,
      site_id: data.site_id,
      instance_id: data.instance_id 
    }));
    
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
// Supports both Catalog V1 and V3 APIs

/**
 * Normalize product from Catalog V1 format
 */
const normalizeWixProductV1 = (p) => {
  const id = p.id || p._id || p.productId || '';
  const title = p.name || p.title || p.productName || '';

  // Images: V1 uses media array
  let image = null;
  if (Array.isArray(p.media) && p.media.length) {
    const mainMedia = p.media.find(m => m.mainMedia) || p.media[0];
    image = mainMedia?.image?.url || mainMedia?.url || null;
  }
  if (!image && Array.isArray(p.mediaItems) && p.mediaItems.length) {
    image = p.mediaItems[0]?.image?.url || p.mediaItems[0]?.url || null;
  }

  // Price / currency
  const price = p.price?.price || p.price?.amount || (p.priceData && p.priceData.price) || null;
  const currency = p.price?.currency || p.priceData?.currency || 'USD';

  // Inventory
  const inventoryQuantity = p.stock?.quantity || p.inventory?.availableQuantity || 0;
  const inStock = p.stock?.inStock ?? (inventoryQuantity > 0);

  // Variants
  const variants = (p.variants || []).map((v) => {
    const vid = v.id || v._id || null;
    const sku = v.sku || null;
    const vPrice = v.variant?.priceData?.price || v.price?.amount || null;
    const vCurrency = v.variant?.priceData?.currency || currency;
    const inventoryQty = v.stock?.quantity || null;
    const attributes = Object.entries(v.choices || {}).map(([key, value]) => ({ id: key, label: value }));
    return { id: vid, sku, price: vPrice, currency: vCurrency, inventoryQuantity: inventoryQty, attributes };
  });

  const sku = p.sku || (variants[0] && variants[0].sku) || null;

  return { id, title, sku, price, currency, inventoryQuantity, inStock, image, variants, _catalogVersion: 'v1' };
};

/**
 * Normalize product from Catalog V3 format
 * V3 uses different field names and structure
 */
const normalizeWixProductV3 = (p) => {
  const id = p.id || p._id || '';
  const title = p.name || '';

  // Images: V3 uses media.mainMedia and media.items
  let image = null;
  if (p.media?.mainMedia?.image?.url) {
    image = p.media.mainMedia.image.url;
  } else if (Array.isArray(p.media?.items) && p.media.items.length) {
    image = p.media.items[0]?.image?.url || null;
  }

  // Price: V3 uses priceData with formatted and amount
  const price = p.priceData?.price || p.price?.amount || null;
  const currency = p.priceData?.currency || 'USD';

  // Inventory: V3 uses stock object
  const inventoryQuantity = p.stock?.quantity || 0;
  const inStock = p.stock?.inStock ?? p.stock?.trackQuantity === false ?? (inventoryQuantity > 0);

  // Variants: V3 has different structure
  const variants = (p.variants || []).map((v) => {
    const vid = v.id || null;
    const sku = v.sku || null;
    const vPrice = v.variant?.priceData?.price || null;
    const vCurrency = v.variant?.priceData?.currency || currency;
    const inventoryQty = v.stock?.quantity || null;
    // V3 uses choices object { "Color": "Red", "Size": "M" }
    const attributes = Object.entries(v.choices || {}).map(([key, value]) => ({ id: key, label: value }));
    return { id: vid, sku, price: vPrice, currency: vCurrency, inventoryQuantity: inventoryQty, attributes };
  });

  const sku = p.sku || (variants[0] && variants[0].sku) || null;

  return { id, title, sku, price, currency, inventoryQuantity, inStock, image, variants, _catalogVersion: 'v3' };
};

/**
 * Legacy normalizer for backward compatibility
 */
const normalizeWixProduct = (p) => {
  // Try to detect version based on response structure
  // V3 typically has priceData, V1 has price object
  if (p.priceData || (p.media && p.media.mainMedia)) {
    return normalizeWixProductV3(p);
  }
  return normalizeWixProductV1(p);
};

/**
 * Fetch products using Catalog V1 API
 * Endpoint: POST /stores/v1/products/query
 */
const getProductsV1 = async (accessToken, { limit = 50 } = {}) => {
  let products = [];
  let offset = 0;
  
  while (true) {
    const body = { 
      query: {
        paging: { limit, offset }
      }
    };
    const endpoint = 'https://www.wixapis.com/stores/v1/products/query';
    
    const resp = await axios.post(endpoint, body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    });
    
    const data = resp.data || {};
    const items = data.products || [];
    products.push(...items);
    
    if (items.length < limit) break;
    offset += items.length;
  }
  
  return products.map(normalizeWixProductV1);
};

/**
 * Fetch products using Catalog V3 API (eCommerce)
 * Endpoint: POST /stores/v3/products/query
 */
const getProductsV3 = async (accessToken, { limit = 50 } = {}) => {
  let products = [];
  let offset = 0;
  
  while (true) {
    const body = {
      query: {
        paging: { limit, offset }
      },
      includeVariants: true,
      includeHiddenProducts: false
    };
    const endpoint = 'https://www.wixapis.com/stores/v3/products/query';
    
    const resp = await axios.post(endpoint, body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    });
    
    const data = resp.data || {};
    const items = data.products || [];
    products.push(...items);
    
    if (items.length < limit) break;
    offset += items.length;
  }
  
  return products.map(normalizeWixProductV3);
};

/**
 * Get all products - tries V3 first, falls back to V1
 * This ensures compatibility with both Catalog versions
 */
const getAllProducts = async (accessToken, { siteId, limit = 50 } = {}) => {
  // Try V3 first (newer sites)
  try {
    console.log('[wixApi] Attempting to fetch products using Catalog V3 API...');
    const products = await getProductsV3(accessToken, { limit });
    console.log(`[wixApi] Successfully fetched ${products.length} products using Catalog V3`);
    return products;
  } catch (v3Err) {
    const v3Status = v3Err?.response?.status;
    const v3ErrorCode = v3Err?.response?.data?.message || v3Err?.response?.data?.details?.applicationError?.code;
    
    // If V3 returns 404 or specific "not found" errors, try V1
    // Also fall back on 400/403 which might indicate V3 not available
    if (v3Status === 404 || v3Status === 400 || v3Status === 403 || v3ErrorCode === 'NOT_FOUND') {
      console.log('[wixApi] Catalog V3 not available, falling back to V1 API...');
    } else {
      // Log the V3 error but still try V1 as fallback
      console.warn('[wixApi] Catalog V3 error, trying V1:', v3Err?.response?.data || v3Err.message);
    }
  }
  
  // Fall back to V1 (older sites or if V3 fails)
  try {
    console.log('[wixApi] Fetching products using Catalog V1 API...');
    const products = await getProductsV1(accessToken, { limit });
    console.log(`[wixApi] Successfully fetched ${products.length} products using Catalog V1`);
    return products;
  } catch (v1Err) {
    console.error('[wixApi] Both Catalog V3 and V1 failed');
    console.error('[wixApi] V1 error:', v1Err?.response?.data || v1Err.message);
    throw v1Err;
  }
};

module.exports = {
  exchangeCodeForToken,
  injectHeadScript,
  getAllProducts,
  getProductsV1,
  getProductsV3,
  normalizeWixProduct,
  normalizeWixProductV1,
  normalizeWixProductV3,
  refreshAccessToken,
  withTokenRefresh,
  removeHeadScript,
};
