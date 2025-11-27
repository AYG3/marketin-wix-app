const knex = require('../db');
const crypto = require('crypto');
const marketin = require('../services/marketin.service');
const { decrypt } = require('../utils/crypto');

// validate HMAC-SHA256 signature header from Wix if secret is configured
const validateWebhookSignature = (req) => {
  const secret = process.env.WIX_WEBHOOK_SECRET || process.env.WIX_CLIENT_SECRET;
  if (!secret) return true; // no secret configured -> accept by default
  const signature = req.headers['x-wix-signature'] || req.headers['x-wix-signature-sha256'] || req.headers['x-wix-signature-hmac'];
  if (!signature) return false;
  const payload = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  // signature may include sha256= prefix
  const received = (String(signature)).replace(/^sha256=/i, '');
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(hmac));
};

const getAffiliateForOrder = async (order) => {
  // 1. Look for affiliate id in known fields
  const buyerInfo = order.buyerInfo || order.buyer || order;
  const affiliateId = (buyerInfo && (buyerInfo.affiliateId || buyerInfo.affiliate_id || buyerInfo.utm_affiliate || buyerInfo.partner_id)) || null;
  if (affiliateId) return affiliateId;

  // 2. try parsing cookies or custom fields: many stores put affiliate in 'customFields'
  const customFields = order.customFields || buyerInfo.customFields || order.additionalFields || {};
  if (customFields && (customFields.affiliateId || customFields.affiliate_id)) return customFields.affiliateId || customFields.affiliate_id;

  // 3. Fallback: look at recent stored order webhooks for same buyer email/session, try to extract an affiliate id
  try {
    const email = buyerInfo && (buyerInfo.email || buyerInfo.emailAddress || order.buyerEmail);
    if (!email) return null;
    const rows = await knex('order_webhooks').whereRaw("payload LIKE ?", [`%${email}%`]).orderBy('created_at', 'desc').limit(10);
    for (const r of rows) {
      try {
        const payload = JSON.parse(r.payload);
        const b = payload.buyerInfo || payload.buyer || payload;
        if (b && (b.affiliateId || b.affiliate_id || b.partner_id)) return b.affiliateId || b.affiliate_id || b.partner_id;
      } catch (e) { /* ignore */ }
    }
  } catch (e) {
    console.error('getAffiliateForOrder fallback search error', e?.message || e);
  }
  return null;
};

exports.handleOrderWebhook = async (req, res) => {
  // this handler is the simple webhook store/ACK - keep for backward compatibility
  try {
    const order = req.body;
    // basic ack + store
    await knex('order_webhooks').insert({ payload: JSON.stringify(order), created_at: new Date() });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('handleOrderWebhook error', err);
    res.status(500).json({ error: 'Could not process webhook' });
  }
};

exports.handleWixOrderWebhook = async (req, res) => {
  try {
    // Validate signature if configured
    if (!validateWebhookSignature(req)) return res.status(401).json({ error: 'Invalid signature' });
    const order = req.body;
    // store raw event quickly
    await knex('order_webhooks').insert({ payload: JSON.stringify(order), created_at: new Date() });

    // parse required fields
    const orderId = order.orderId || order.id || order._id || (order.order && order.order.id) || null;
    const totalAmount = order.total && (order.total.amount || order.total) || order.totalAmount || (order.order && order.order.total && order.order.total.amount) || null;
    const currency = (order.total && order.total.currency) || order.currency || (order.order && order.order.total && order.order.total.currency) || 'USD';
    const buyer = order.buyer || order.buyerInfo || order.buyerDetails || {};
    const lineItems = order.lineItems || order.items || (order.order && order.order.lineItems) || [];

    // Resolve affiliate
    const affiliateId = await getAffiliateForOrder(order);

    // Find site id: Wix includes site info often in 'siteId' or in order metadata
    const siteId = order.siteId || order.site_id || order.order && order.order.siteId || null;

    // Send conversion to Market!N asynchronously (don't block ack)
    (async () => {
      try {
        await marketin.sendConversion({ apiKey: process.env.MARKETIN_API_KEY, siteId, orderId, amount: totalAmount, currency, affiliateId });
      } catch (err) {
        console.error('sendConversion failed', err?.response?.data || err.message || err);
      }
    })();

    // respond quickly
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('handleWixOrderWebhook error', err?.response?.data || err.message || err);
    res.status(500).json({ error: 'webhook processing failed' });
  }
};
