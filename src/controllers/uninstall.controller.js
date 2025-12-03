/**
 * Uninstall Controller
 * Handles Wix app uninstall webhooks and cleanup
 */
const knex = require('../db');
const wixApi = require('../services/wixApi.service');
const { decrypt } = require('../utils/crypto');
const crypto = require('crypto');

/**
 * Validate Wix webhook signature
 * Wix signs webhooks with HMAC-SHA256 using the app secret
 */
const validateWebhookSignature = (rawBody, signature) => {
  const secret = process.env.WIX_WEBHOOK_SECRET || process.env.WIX_CLIENT_SECRET;
  
  if (!secret) {
    console.warn('[uninstall] No webhook secret configured, skipping signature validation');
    return true;
  }

  if (!signature) {
    console.warn('[uninstall] No signature in webhook request');
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');

    // Constant-time comparison
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    
    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (err) {
    console.error('[uninstall] Signature validation error:', err.message);
    return false;
  }
};

/**
 * POST /wix/uninstall
 * Handles app uninstall webhook from Wix
 * 
 * Wix sends this when a user uninstalls the app from their site.
 * Payload typically includes:
 * - instanceId: The app instance ID
 * - siteId: The Wix site ID (may be in data object)
 * - eventType: "AppRemoved" or similar
 */
exports.handleUninstall = async (req, res) => {
  try {
    // Get raw body for signature validation
    const rawBody = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
    const signature = req.headers['x-wix-signature'] || req.headers['x-wix-hmac'];

    // Validate signature (but don't reject in dev mode)
    const isValid = validateWebhookSignature(rawBody, signature);
    if (!isValid && process.env.NODE_ENV === 'production') {
      console.error('[uninstall] Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse payload - Wix may send different formats
    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        console.error('[uninstall] Failed to parse payload:', e.message);
      }
    }

    console.log('[uninstall] Received uninstall webhook:', JSON.stringify(payload).slice(0, 500));

    // Extract identifiers from various possible locations
    const instanceId = payload.instanceId 
      || payload.instance_id 
      || payload.data?.instanceId 
      || payload.data?.instance_id;
    
    const siteId = payload.siteId 
      || payload.site_id 
      || payload.data?.siteId 
      || payload.data?.site_id
      || payload.metaSiteId
      || payload.data?.metaSiteId;

    if (!instanceId && !siteId) {
      console.warn('[uninstall] No instanceId or siteId found in payload');
      // Still return 200 to acknowledge receipt
      return res.status(200).json({ ok: true, message: 'No identifiers found' });
    }

    // Find the token record
    let tokenRow = null;
    if (siteId) {
      tokenRow = await knex('wix_tokens').where({ site_id: siteId }).first();
    }
    if (!tokenRow && instanceId) {
      tokenRow = await knex('wix_tokens').where({ instance_id: instanceId }).first();
    }

    if (!tokenRow) {
      console.log('[uninstall] No token found for site/instance, may already be cleaned up');
      return res.status(200).json({ ok: true, message: 'No installation found' });
    }

    console.log(`[uninstall] Processing uninstall for site_id=${tokenRow.site_id}, instance_id=${tokenRow.instance_id}`);

    // Attempt to remove injected script (best effort)
    if (tokenRow.access_token && tokenRow.injected) {
      try {
        const accessToken = decrypt(tokenRow.access_token);
        // Note: We'd need to store script_id during injection to remove it
        // For now, just log that we would remove it
        console.log('[uninstall] Would remove head script if script_id was stored');
        // await wixApi.removeHeadScript({ siteId: tokenRow.site_id, token: accessToken, scriptId: tokenRow.script_id });
      } catch (err) {
        console.error('[uninstall] Failed to remove head script:', err.message);
        // Continue with cleanup even if this fails
      }
    }

    // Mark as uninstalled (soft delete) rather than hard delete
    // This preserves data for potential re-install or debugging
    await knex('wix_tokens')
      .where({ id: tokenRow.id })
      .update({
        is_active: false,
        uninstalled_at: new Date(),
        // Clear sensitive tokens
        access_token: null,
        refresh_token: null,
      });

    console.log(`[uninstall] Successfully processed uninstall for site ${tokenRow.site_id}`);

    // Clean up related data (optional - could keep for re-install)
    // Uncomment these if you want to delete related records:
    /*
    if (tokenRow.site_id) {
      await knex('product_mappings').where({ site_id: tokenRow.site_id }).delete();
      await knex('visitor_sessions').where({ site_id: tokenRow.site_id }).delete();
    }
    */

    res.status(200).json({ ok: true, message: 'Uninstall processed' });

  } catch (err) {
    console.error('[uninstall] Error processing uninstall:', err.message);
    // Still return 200 to prevent Wix from retrying
    res.status(200).json({ ok: false, error: err.message });
  }
};

/**
 * POST /wix/app-removed (alternative endpoint name)
 * Alias for handleUninstall - some Wix versions use different event names
 */
exports.handleAppRemoved = exports.handleUninstall;
