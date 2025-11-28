const axios = require('axios');

// Default API URL - production Market!N endpoint
const MARKETIN_API_URL = process.env.MARKETIN_API_URL || 'https://api.marketin.now/api/v1';

const createClient = (apiKey) => {
  return axios.create({
    baseURL: MARKETIN_API_URL,
    headers: {
      'Authorization': `Bearer ${apiKey || process.env.MARKETIN_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000 // 30 second timeout
  });
};

const marketinClient = createClient(process.env.MARKETIN_API_KEY);

/**
 * Bulk sync products to Market!N
 */
const bulkSyncProducts = async ({ apiKey, brandId, products }) => {
  const client = createClient(apiKey);
  const endpoint = `/sdk/wix/bulk-sync/`;
  try {
    const resp = await client.post(endpoint, { brand_id: brandId, products });
    return resp.data;
  } catch (err) {
    console.error('bulkSyncProducts error', err?.response?.data || err.message || err);
    throw err;
  }
};

/**
 * Send conversion to Market!N (legacy simple interface)
 * @deprecated Use sendConversionDirect for full payload support
 */
const sendConversion = async ({ apiKey, siteId, orderId, amount, currency, affiliateId }) => {
  return sendConversionDirect({
    brandId: siteId, // map siteId to brandId for backward compat
    externalOrderId: orderId,
    amount,
    currency,
    affiliateId
  }, apiKey);
};

/**
 * Send conversion with full Market!N API payload
 * Based on LogConversionProxyView expected fields:
 * {
 *   brandId: number,           // X-BRAND-ID or brand_id
 *   externalOrderId: string,   // conversionRef / external_order_id
 *   amount: number,            // value
 *   currency: string,          // currency (default: NGN)
 *   affiliateId: string,       // affiliateId (user_id in API)
 *   campaignId: string,        // campaignId
 *   customerEmail: string,     // metadata
 *   customerName: string,      // metadata
 *   products: [{               // cartItems
 *     externalProductId: string,
 *     name: string,
 *     price: number,
 *     quantity: number
 *   }],
 *   sessionId: string,
 *   metadata: object
 * }
 */
const sendConversionDirect = async (payload, apiKey = null) => {
  const client = createClient(apiKey);
  const endpoint = `/sdk-log-conversion/`;

  // Map to Market!N API expected format
  const apiPayload = {
    campaignId: payload.campaignId,
    affiliateId: payload.affiliateId,
    productId: payload.productId || (payload.products?.[0]?.externalProductId),
    sessionId: payload.sessionId,
    eventType: payload.eventType || 'purchase',
    value: payload.amount,
    currency: payload.currency || 'USD',
    conversionRef: payload.externalOrderId,
    metadata: {
      ...payload.metadata,
      customerEmail: payload.customerEmail,
      customerName: payload.customerName,
      wixOrderId: payload.externalOrderId,
      source: 'wix'
    },
    cartItems: (payload.products || []).map(p => ({
      productId: p.externalProductId || p.productId,
      price: p.price,
      quantity: p.quantity || 1,
      metadata: { name: p.name }
    }))
  };

  // Add brand header for SDK endpoint
  const headers = {};
  if (payload.brandId) {
    headers['X-BRAND-ID'] = String(payload.brandId);
  }

  try {
    const resp = await client.post(endpoint, apiPayload, { headers });
    
    // Check response format
    const data = resp.data;
    if (data.status === 'error') {
      const err = new Error(data.message || 'Conversion failed');
      err.response = { status: resp.status, data };
      throw err;
    }
    
    return {
      success: true,
      conversionId: data.conversion_id,
      reward: data.reward,
      status: data.status
    };
  } catch (err) {
    // Enhance error with response details
    const enhanced = new Error(err?.response?.data?.message || err?.response?.data?.detail || err.message);
    enhanced.code = err.code;
    enhanced.response = err.response;
    console.error('sendConversionDirect error', {
      status: err?.response?.status,
      data: err?.response?.data,
      message: err.message
    });
    throw enhanced;
  }
};

/**
 * Validate API key by making a simple request
 */
const validateApiKey = async (apiKey) => {
  try {
    const client = createClient(apiKey);
    // Try a lightweight endpoint - adjust based on what's available
    await client.get('/health/', { timeout: 5000 });
    return { valid: true };
  } catch (err) {
    if (err?.response?.status === 401 || err?.response?.status === 403) {
      return { valid: false, reason: 'Invalid API key' };
    }
    // Network error - can't determine validity
    return { valid: null, reason: 'Could not verify' };
  }
};

module.exports = {
  client: marketinClient,
  createClient,
  bulkSyncProducts,
  sendConversion,
  sendConversionDirect,
  validateApiKey,
  MARKETIN_API_URL
};
