/**
 * Wix Order Webhook Controller
 * Handles Wix order webhooks with robust parsing, session-based attribution, and queued conversion sending
 */
const knex = require('../db');
const crypto = require('crypto');
const { enqueueConversion, processQueue } = require('../services/conversionQueue.service');
const { findAffiliateByVisitor } = require('./visitorSession.controller');

/**
 * Wix Public Key for webhook signature verification
 * Wix uses RSA public key signatures, not HMAC secrets
 * Set WIX_PUBLIC_KEY in env or use inline default
 */
const getWixPublicKey = () => {
  const envKey = process.env.WIX_PUBLIC_KEY;
  if (!envKey) return null;

  // Trim surrounding quotes if present (some .env editors wrap values in quotes)
  let key = envKey.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.substring(1, key.length - 1);
  }

  // If the value contains literal backslash-n sequences (\n), convert them to real newlines
  if (key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }

  // Normalize CRLF -> LF
  key = key.replace(/\r\n/g, '\n');

  // If it's already a PEM with BEGIN header, return
  if (key.includes('-----BEGIN')) {
    return key;
  }

  // Otherwise, assume it's base64 encoded; attempt to decode
  try {
    const decoded = Buffer.from(key, 'base64').toString('utf8');
    if (decoded.includes('-----BEGIN')) return decoded;
    // If decode didn't contain PEM header, fall back to the raw value (best-effort)
    return key;
  } catch (err) {
    // Not valid base64, just return the raw value
    return key;
  }
};

/**
 * Validate Wix webhook signature using RSA public key (Wix SDK method)
 * Wix signs webhooks with their private key; we verify with their public key
 * 
 * Signature header: x-wix-signature (base64 encoded)
 * Algorithm: RSA-SHA256
 */
const validateWixPublicKeySignature = (req) => {
  const publicKey = getWixPublicKey();
  if (!publicKey) return { valid: false, reason: 'no_public_key_configured' };

  const signature = req.headers['x-wix-signature'];
  if (!signature) return { valid: false, reason: 'no_signature_header' };

  try {
    const payload = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(payload);
    
    const isValid = verifier.verify(publicKey, signature, 'base64');
    return { valid: isValid, reason: isValid ? 'public_key_verified' : 'signature_mismatch' };
  } catch (err) {
    console.error('RSA signature verification error:', err?.message);
    return { valid: false, reason: 'verification_error', error: err?.message };
  }
};

/**
 * Validate HMAC-SHA256 signature from Wix webhook (legacy/fallback method)
 */
const validateHmacSignature = (req) => {
  const secret = process.env.WIX_WEBHOOK_SECRET || process.env.WIX_CLIENT_SECRET;
  if (!secret) return { valid: false, reason: 'no_secret_configured' };

  const signature = 
    req.headers['x-wix-signature'] || 
    req.headers['x-wix-signature-sha256'] || 
    req.headers['x-wix-signature-hmac'] ||
    req.headers['x-wix-hmac'];
  
  if (!signature) return { valid: false, reason: 'no_signature_header' };

  const payload = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  
  // signature may include sha256= prefix
  const received = String(signature).replace(/^sha256=/i, '').toLowerCase();
  const expected = hmac.toLowerCase();

  try {
    const isValid = crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
    return { valid: isValid, reason: isValid ? 'hmac_verified' : 'hmac_mismatch' };
  } catch {
    const isValid = received === expected;
    return { valid: isValid, reason: isValid ? 'hmac_verified' : 'hmac_mismatch' };
  }
};

/**
 * Unified webhook signature validation
 * Tries public key verification first (Wix's preferred method), falls back to HMAC
 */
const validateWebhookSignature = (req) => {
  // Allow test webhooks in development mode
  const isTestWebhook = req.headers['x-wix-webhook-test'] === 'true';
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  if (isTestWebhook && isDevelopment) {
    console.log('⚠️  Test webhook - bypassing signature verification (dev mode only)');
    return true;
  }
  
  // In development/test mode without any keys, accept all webhooks
  const publicKey = getWixPublicKey();
  const hmacSecret = process.env.WIX_WEBHOOK_SECRET || process.env.WIX_CLIENT_SECRET;
  
  if (!publicKey && !hmacSecret) {
    console.log('No webhook verification configured - accepting webhook');
    return true;
  }

  // Try RSA public key verification first (Wix's primary method)
  if (publicKey) {
    const rsaResult = validateWixPublicKeySignature(req);
    if (rsaResult.valid) {
      console.log('Webhook verified via RSA public key');
      return true;
    }
    console.log('RSA verification failed:', rsaResult.reason);
  }

  // Fallback to HMAC verification
  if (hmacSecret) {
    const hmacResult = validateHmacSignature(req);
    if (hmacResult.valid) {
      console.log('Webhook verified via HMAC');
      return true;
    }
    console.log('HMAC verification failed:', hmacResult.reason);
  }

  // Both methods failed
  return false;
};

// Helper to safely parse JSON from raw body when a sender uses text/plain
const getRequestBody = (req) => {
  // If body is already a parsed object, use it
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) return req.body;
  // Attempt to parse the raw body (buffer) if present
  const raw = req.rawBody || req.body || null;
  if (!raw) return {};
  try {
    // Buffer -> string -> JSON parse. If it's already a string that looks like JSON, parse it.
    const str = Buffer.isBuffer(raw) ? raw.toString('utf8') : (typeof raw === 'string' ? raw : JSON.stringify(raw));
    return JSON.parse(str);
  } catch (err) {
    // Not JSON, return original body or empty
    return req.body || {};
  }
};

/**
 * Parse Wix order payload - handles multiple Wix payload formats
 * Official format:
 * {
 *   entityId: "uuid",
 *   slug: "stores/orders",
 *   eventType: "OrderPaid",
 *   data: {
 *     order: {
 *       id, number, totalPrice: { amount, currency },
 *       billingInfo: { email, fullName },
 *       buyerNote: "ref=AFF123",
 *       lineItems: [{ productId, name, quantity, price: { amount, currency } }]
 *     }
 *   }
 * }
 */
const parseWixOrderPayload = (body) => {
  // Handle nested data.order format (official Wix webhook)
  const order = body.data?.order || body.order || body;
  
  // Extract order ID
  const orderId = 
    body.entityId ||
    order.id || 
    order._id || 
    order.orderId || 
    order.order_id ||
    null;

  // Extract order number (display number)
  const orderNumber = order.number || order.orderNumber || null;

  // Extract total price
  let totalAmount = null;
  let currency = 'USD';
  
  if (order.totalPrice) {
    totalAmount = parseFloat(order.totalPrice.amount || order.totalPrice);
    currency = order.totalPrice.currency || currency;
  } else if (order.total) {
    totalAmount = parseFloat(order.total.amount || order.total);
    currency = order.total.currency || currency;
  } else if (order.totals?.total) {
    totalAmount = parseFloat(order.totals.total);
    currency = order.currency || currency;
  } else if (order.priceSummary?.total) {
    totalAmount = parseFloat(order.priceSummary.total.amount || order.priceSummary.total);
    currency = order.priceSummary.total.currency || currency;
  }

  // Extract buyer info
  const billingInfo = order.billingInfo || order.buyerInfo || order.buyer || {};
  const customerEmail = 
    billingInfo.email || 
    billingInfo.emailAddress || 
    order.buyerEmail ||
    order.email ||
    null;
  const customerName = 
    billingInfo.fullName || 
    billingInfo.name ||
    `${billingInfo.firstName || ''} ${billingInfo.lastName || ''}`.trim() ||
    null;

  // Extract affiliate info from multiple sources
  let affiliateId = null;
  let campaignId = null;
  let sessionId = null;

  // 1. Check buyerNote for ref=AFF123 pattern
  const buyerNote = order.buyerNote || order.note || order.customerNote || '';
  const refMatch = buyerNote.match(/(?:ref|aid|affiliate)[=:]?\s*([A-Za-z0-9_-]+)/i);
  if (refMatch) {
    affiliateId = refMatch[1];
  }

  // 2. Check custom fields
  const customFields = order.customFields || order.additionalFields || billingInfo.customFields || {};
  affiliateId = affiliateId || customFields.aid || customFields.affiliateId || customFields.affiliate_id || customFields.ref;
  campaignId = campaignId || customFields.cid || customFields.campaignId || customFields.campaign_id;
  sessionId = sessionId || customFields.sessionId || customFields.session_id || customFields.sid;

  // 3. Check channelInfo (Wix stores tracking info here sometimes)
  const channelInfo = order.channelInfo || {};
  affiliateId = affiliateId || channelInfo.affiliateId || channelInfo.externalOrderId;

  // 4. Check custom buyer fields
  const buyerCustomFields = order.buyerInfo?.customFields || [];
  if (Array.isArray(buyerCustomFields)) {
    for (const field of buyerCustomFields) {
      if (['aid', 'affiliate_id', 'affiliateId', 'ref'].includes(field.name || field.key)) {
        affiliateId = affiliateId || field.value;
      }
      if (['cid', 'campaign_id', 'campaignId'].includes(field.name || field.key)) {
        campaignId = campaignId || field.value;
      }
      if (['sid', 'session_id', 'sessionId'].includes(field.name || field.key)) {
        sessionId = sessionId || field.value;
      }
    }
  }

  // Extract line items (products)
  const rawLineItems = order.lineItems || order.items || order.products || [];
  const products = rawLineItems.map(item => ({
    externalProductId: item.productId || item.product_id || item.catalogReference?.catalogItemId || item.id,
    name: item.name || item.productName || item.title || 'Unknown Product',
    price: parseFloat(item.price?.amount || item.price || item.priceData?.price || 0),
    quantity: parseInt(item.quantity || 1, 10),
    currency: item.price?.currency || item.currency || currency
  }));

  // Extract site info
  const siteId = 
    order.siteId || 
    body.siteId || 
    body.instanceId ||
    order.channelInfo?.externalOrderUrl?.match(/\/([a-f0-9-]+)\//)?.[1] ||
    null;

  // Extract visitor/session tracking
  const visitorId = 
    order.buyerInfo?.visitorId || 
    order.visitorId ||
    customFields.visitorId ||
    null;

  return {
    orderId,
    orderNumber,
    totalAmount,
    currency,
    customerEmail,
    customerName,
    affiliateId,
    campaignId,
    sessionId,
    visitorId,
    siteId,
    products,
    eventType: body.eventType || body.event_type || 'OrderPaid',
    raw: body
  };
};

/**
 * Resolve affiliate through multiple fallback methods
 */
const resolveAffiliate = async (parsedOrder) => {
  // 1. Direct affiliate ID from order
  if (parsedOrder.affiliateId) {
    return {
      affiliateId: parsedOrder.affiliateId,
      campaignId: parsedOrder.campaignId,
      source: 'order_direct'
    };
  }

  // 2. Session-based lookup
  const sessionResult = await findAffiliateByVisitor({
    siteId: parsedOrder.siteId,
    visitorId: parsedOrder.visitorId,
    email: parsedOrder.customerEmail,
    sessionId: parsedOrder.sessionId
  });
  
  if (sessionResult?.affiliateId) {
    return {
      affiliateId: sessionResult.affiliateId,
      campaignId: sessionResult.campaignId || parsedOrder.campaignId,
      source: sessionResult.source
    };
  }

  // 3. Historical order lookup (same customer email)
  if (parsedOrder.customerEmail) {
    try {
      const rows = await knex('order_webhooks')
        .whereRaw("payload LIKE ?", [`%${parsedOrder.customerEmail}%`])
        .orderBy('created_at', 'desc')
        .limit(10);

      for (const row of rows) {
        try {
          const historic = parseWixOrderPayload(JSON.parse(row.payload));
          if (historic.affiliateId) {
            return {
              affiliateId: historic.affiliateId,
              campaignId: historic.campaignId || parsedOrder.campaignId,
              source: 'historic_order'
            };
          }
        } catch { /* ignore parse errors */ }
      }
    } catch (err) {
      console.error('Historic order lookup failed', err?.message);
    }
  }

  return null;
};

/**
 * Main Wix order webhook handler
 * POST /wix/orders/webhook
 */
exports.handleWixOrderWebhook = async (req, res) => {
  try {
    // 1. Validate signature
    if (!validateWebhookSignature(req)) {
      console.warn('Invalid webhook signature received');
      return res.status(401).json({ error: 'Invalid signature' });
    }

      // 2. Store raw webhook immediately (for debugging/replay). Parse fallback for text/plain bodies
      const parsedBody = getRequestBody(req);
      const webhookPayloadStr = JSON.stringify(parsedBody || {});
      const [webhookId] = await knex('order_webhooks').insert({
        payload: webhookPayloadStr,
        created_at: new Date()
      });

    // 3. Parse order payload
    const parsedOrder = parseWixOrderPayload(parsedBody || req.body || {});
    
    console.log('Parsed Wix order:', {
      orderId: parsedOrder.orderId,
      amount: parsedOrder.totalAmount,
      currency: parsedOrder.currency,
      affiliateId: parsedOrder.affiliateId,
      products: parsedOrder.products?.length
    });

    // 4. Skip if not a paid order event
    const paidEvents = ['OrderPaid', 'order.paid', 'order/paid', 'PAID'];
    if (!paidEvents.some(e => parsedOrder.eventType?.toLowerCase().includes(e.toLowerCase()))) {
      console.log('Skipping non-paid event:', parsedOrder.eventType);
      return res.status(200).json({ ok: true, skipped: true, reason: 'not_paid_event' });
    }

    // 5. Resolve affiliate
    const attribution = await resolveAffiliate(parsedOrder);
    
    if (!attribution?.affiliateId) {
      console.log('No affiliate found for order:', parsedOrder.orderId);
      // Still acknowledge webhook, but don't send conversion
      return res.status(200).json({ 
        ok: true, 
        skipped: true, 
        reason: 'no_affiliate',
        orderId: parsedOrder.orderId 
      });
    }

    console.log('Affiliate resolved:', attribution);

    // 6. Build conversion payload
    // Resolve brandId from the configured token if available
    const siteId = parsedOrder.siteId;
    let tokenRow = null;
    if (siteId) {
      tokenRow = await knex('wix_tokens').where({ site_id: siteId, is_active: true }).first();
    }
    const brandIdFromToken = tokenRow?.brand_id;
    const conversionPayload = {
      brandId: brandIdFromToken || process.env.MARKETIN_BRAND_ID || parsedOrder.siteId,
      siteId: siteId,
      campaignId: attribution.campaignId,
      affiliateId: attribution.affiliateId,
      externalOrderId: parsedOrder.orderId,
      amount: parsedOrder.totalAmount,
      currency: parsedOrder.currency,
      customerEmail: parsedOrder.customerEmail,
      customerName: parsedOrder.customerName,
      sessionId: parsedOrder.sessionId,
      products: parsedOrder.products,
      metadata: {
        orderNumber: parsedOrder.orderNumber,
        eventType: parsedOrder.eventType,
        attributionSource: attribution.source,
        webhookId
      }
    };

    // 7. Enqueue conversion for sending with retry
    const queueResult = await enqueueConversion(conversionPayload, webhookId);
    
    console.log('Conversion enqueued:', queueResult);

    // 8. Try to process queue immediately (non-blocking)
    setImmediate(async () => {
      try {
        await processQueue(5);
      } catch (err) {
        console.error('Queue processing error:', err?.message);
      }
    });

    // 9. Respond quickly to Wix
    res.status(200).json({ 
      ok: true,
      orderId: parsedOrder.orderId,
      queued: queueResult.status === 'pending',
      affiliateId: attribution.affiliateId
    });

  } catch (err) {
    console.error('handleWixOrderWebhook error:', err?.message || err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

/**
 * Legacy simple webhook handler (backward compatible)
 */
exports.handleOrderWebhook = async (req, res) => {
  try {
    await knex('order_webhooks').insert({
      payload: JSON.stringify(req.body),
      created_at: new Date()
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('handleOrderWebhook error', err);
    res.status(500).json({ error: 'Could not process webhook' });
  }
};

/**
 * Test webhook route - logs full payload for debugging
 * POST /wix/test-webhook
 */
exports.handleTestWebhook = async (req, res) => {
  console.log('=== TEST WEBHOOK RECEIVED ===');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  const parsedBody = getRequestBody(req);
  console.log('Body:', JSON.stringify(parsedBody, null, 2));
  console.log('=== END TEST WEBHOOK ===');
  
  // Also store it
  try {
    await knex('order_webhooks').insert({
      payload: JSON.stringify({
        _test: true,
        headers: req.headers,
        body: parsedBody,
        timestamp: new Date().toISOString()
      }),
      created_at: new Date()
    });
  } catch { /* ignore */ }
  
  res.status(200).send('ok');
};

// Export for testing
exports.parseWixOrderPayload = parseWixOrderPayload;
exports.validateWebhookSignature = validateWebhookSignature;
exports.resolveAffiliate = resolveAffiliate;
