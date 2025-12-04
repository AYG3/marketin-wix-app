/**
 * Iframe Controller
 * Handles API endpoints for the Wix embedded iframe dashboard
 */
const knex = require('../db');
const { decrypt, encrypt } = require('../utils/crypto');
const marketinService = require('../services/marketin.service');
const injectService = require('../services/inject.service');
const wixApi = require('../services/wixApi.service');
const crypto = require('crypto');

/**
 * Validate Wix instance signature
 * Wix instance is: base64(signature).base64(payload)
 * Signature = HMAC-SHA256(payload, app_secret)
 */
const validateWixInstance = (instance) => {
  if (!instance) return { valid: false, error: 'No instance provided' };
  
  const appSecret = process.env.WIX_CLIENT_SECRET;
  if (!appSecret) {
    // In development, skip validation if no secret configured
    console.warn('WIX_CLIENT_SECRET not configured, skipping instance validation');
    return { valid: true, data: null, skipped: true };
  }

  try {
    const parts = instance.split('.');
    if (parts.length < 2) {
      return { valid: false, error: 'Invalid instance format' };
    }

    const [signatureB64, payloadB64] = parts;
    
    // Decode signature and payload (base64url)
    const signature = Buffer.from(signatureB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const payload = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    
    // Compute expected signature
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(payloadB64)
      .digest();
    
    // Constant-time comparison
    if (!crypto.timingSafeEqual(signature, expectedSignature)) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Parse payload
    const data = JSON.parse(payload);
    return { valid: true, data: data };
    
  } catch (err) {
    console.error('Wix instance validation error:', err.message);
    return { valid: false, error: 'Validation failed' };
  }
};

/**
 * Middleware: Validate Wix instance from header or query
 * For status endpoint, we allow unauthenticated requests to check installation
 */
exports.wixInstanceAuth = (req, res, next) => {
  const instance = req.headers['x-wix-instance'] || req.query.instance;
  
  // Skip validation for status check (allows checking if installed)
  const isStatusCheck = req.path === '/status' && req.method === 'GET';
  
  if (!instance && isStatusCheck) {
    // Allow status check without instance
    req.wixInstance = null;
    req.wixSiteId = req.query.siteId || null;
    return next();
  }
  
  const result = validateWixInstance(instance);
  
  if (!result.valid && !result.skipped) {
    return res.status(401).json({ error: result.error || 'Unauthorized' });
  }
  
  // Attach instance data to request
  req.wixInstance = result.data;
  
  // Extract siteId from instance or query
  if (result.data) {
    req.wixSiteId = result.data.siteId || result.data.site_id || result.data.instanceId;
  }
  
  // Allow siteId from query param as fallback (for testing)
  if (!req.wixSiteId && req.query.siteId) {
    req.wixSiteId = req.query.siteId;
  }
  
  next();
};

/**
 * GET /admin/iframe/status
 * Returns installation status for the Wix site
 */
exports.getStatus = async (req, res) => {
  try {
    const siteId = req.query.siteId || req.wixSiteId;
    const instanceId = req.wixInstance?.instanceId || req.query.instanceId;
    
    // Try to find token by site_id, instance_id, or get first active token
    let tokenRow = null;
    
    if (siteId) {
      tokenRow = await knex('wix_tokens')
        .where({ site_id: siteId, is_active: true })
        .first();
    }
    
    if (!tokenRow && instanceId) {
      tokenRow = await knex('wix_tokens')
        .where({ instance_id: instanceId, is_active: true })
        .first();
      
      // Update site_id if we found by instance_id and have a siteId from Wix
      if (tokenRow && siteId && tokenRow.site_id !== siteId) {
        await knex('wix_tokens')
          .where({ id: tokenRow.id })
          .update({ site_id: siteId });
        tokenRow.site_id = siteId;
        console.log(`[iframe] Updated site_id to ${siteId} for instance ${instanceId}`);
      }
    }
    
    // Fallback: get first active token (for single-site setups)
    if (!tokenRow) {
      tokenRow = await knex('wix_tokens')
        .where({ is_active: true })
        .first();
      
      // Update site_id if we have one from Wix
      if (tokenRow && siteId && (!tokenRow.site_id || tokenRow.site_id === 'mock-site-id' || tokenRow.site_id === 'chunk-site')) {
        await knex('wix_tokens')
          .where({ id: tokenRow.id })
          .update({ site_id: siteId });
        tokenRow.site_id = siteId;
        console.log(`[iframe] Updated site_id to ${siteId} for token ${tokenRow.id}`);
      }
    }

    if (!tokenRow) {
      return res.json({
        installed: false,
        pixelInjected: false,
        tokenValid: false,
        productsCount: 0,
        lastSync: null,
        message: 'Site not found. Please complete the OAuth installation.'
      });
    }

    const effectiveSiteId = tokenRow.site_id;

    // Check if token is expired
    const now = new Date();
    const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at) : null;
    const tokenExpired = expiresAt ? expiresAt < now : false;
    const tokenValid = !tokenExpired && !!tokenRow.access_token;

    // Get product count
    const [{ count: productsCount }] = await knex('product_mappings')
      .count('* as count');

    // Get last sync time from product_mappings
    const lastProduct = await knex('product_mappings')
      .orderBy('updated_at', 'desc')
      .first();
    const lastSync = lastProduct ? lastProduct.updated_at : null;

    res.json({
      installed: true,
      siteId: effectiveSiteId,
      pixelInjected: !!tokenRow.injected,
      injectedAt: tokenRow.injected_at,
      tokenValid: tokenValid,
      tokenExpired: tokenExpired,
      tokenExpiresAt: expiresAt,
      productsCount: parseInt(productsCount, 10),
      lastSync: lastSync,
      createdAt: tokenRow.created_at
    });

  } catch (err) {
    console.error('getStatus error:', err.message);
    res.status(500).json({ error: 'Failed to get status' });
  }
};

/**
 * Helper function to find token by siteId or fallback to first active token
 */
const findTokenForSite = async (siteId) => {
  let tokenRow = null;
  
  if (siteId) {
    tokenRow = await knex('wix_tokens')
      .where({ site_id: siteId, is_active: true })
      .first();
  }
  
  // Fallback to first active token
  if (!tokenRow) {
    tokenRow = await knex('wix_tokens')
      .where({ is_active: true })
      .first();
  }
  
  return tokenRow;
};

/**
 * POST /admin/iframe/reinject-pixel
 * Re-injects the tracking pixel into the Wix site
 */
exports.reinjectPixel = async (req, res) => {
  try {
    const siteId = req.body.siteId || req.wixSiteId;

    // Find token
    const tokenRow = await findTokenForSite(siteId);

    if (!tokenRow) {
      return res.status(404).json({ error: 'No installation found. Please install the app first.' });
    }

    if (!tokenRow.access_token) {
      return res.status(400).json({ error: 'No access token available' });
    }

    const effectiveSiteId = tokenRow.site_id;

    // Decrypt access token
    const accessToken = decrypt(tokenRow.access_token);

    // Mark pixel as configured
    // Note: Actual script injection is handled by Wix via the Embedded Scripts extension
    const result = await injectService.injectPixel(effectiveSiteId, accessToken);

    res.json({
      ok: true,
      message: result.message,
      sdkUrl: result.sdkUrl,
      brandId: result.brandId,
      snippet: result.snippet,
      injectedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('reinjectPixel error:', err.message);
    res.status(500).json({ error: 'Failed to configure pixel' });
  }
};

/**
 * POST /admin/iframe/refresh-token
 * Refreshes the Wix access token using the refresh token
 */
exports.refreshToken = async (req, res) => {
  try {
    const siteId = req.body.siteId || req.wixSiteId;

    // Find token
    const tokenRow = await findTokenForSite(siteId);

    if (!tokenRow) {
      return res.status(404).json({ error: 'No installation found. Please install the app first.' });
    }

    if (!tokenRow.refresh_token) {
      return res.status(400).json({ error: 'No refresh token available' });
    }

    // Decrypt refresh token
    const refreshToken = decrypt(tokenRow.refresh_token);

    // Use wixApi service for refresh
    const newTokens = await wixApi.refreshAccessToken(refreshToken);

    // Update token in database with tracking fields
    await knex('wix_tokens')
      .where({ id: tokenRow.id })
      .update({
        access_token: encrypt(newTokens.access_token),
        refresh_token: newTokens.refresh_token ? encrypt(newTokens.refresh_token) : tokenRow.refresh_token,
        expires_at: newTokens.expires_at,
        expires_in: newTokens.expires_in,
        last_refresh_at: new Date()
      });

    res.json({
      ok: true,
      expiresAt: newTokens.expires_at
    });

  } catch (err) {
    console.error('refreshToken error:', err?.response?.data || err.message);
    res.status(500).json({ 
      error: 'Failed to refresh token',
      details: err?.response?.data?.message || err.message
    });
  }
};

/**
 * GET /admin/iframe/embedded-script
 * Returns the embedded script snippet and setup instructions
 */
exports.getEmbeddedScript = async (req, res) => {
  try {
    const siteId = req.query.siteId || req.wixSiteId;
    
    // Find token to get site info
    const tokenRow = await findTokenForSite(siteId);
    
    // Use the stored brand_id, or fall back to query param or placeholder
    const brandId = (tokenRow ? tokenRow.brand_id : null) || req.query.brandId || 'YOUR_BRAND_ID';
    const isConfigured = tokenRow && tokenRow.brand_id;
    
    // Get script info
    const scriptInfo = injectService.getEmbeddedScriptInfo(brandId);
    
    res.json({
      ok: true,
      isConfigured: !!isConfigured,
      brandId: isConfigured ? brandId : null,
      ...scriptInfo
    });
    
  } catch (err) {
    console.error('getEmbeddedScript error:', err.message);
    res.status(500).json({ error: 'Failed to get embedded script info' });
  }
};

/**
 * GET /admin/iframe/settings
 * Returns current settings including brandId
 */
exports.getSettings = async (req, res) => {
  try {
    const siteId = req.query.siteId || req.wixSiteId;
    
    const tokenRow = await findTokenForSite(siteId);
    
    if (!tokenRow) {
      return res.status(404).json({ error: 'No installation found' });
    }
    
    res.json({
      ok: true,
      brandId: tokenRow.brand_id || null,
      brandName: tokenRow.brand_name || null,
      brandConfiguredAt: tokenRow.brand_configured_at || null,
      marketinApiKeySet: !!tokenRow.marketin_api_key,
      siteId: tokenRow.site_id
    });
    
  } catch (err) {
    console.error('getSettings error:', err.message);
    res.status(500).json({ error: 'Failed to get settings' });
  }
};

/**
 * POST /admin/iframe/settings
 * Updates settings including brandId and/or marketinApiKey
 * - brandId is required if not already set in DB
 * - marketinApiKey can be updated independently once brandId is set
 */
exports.updateSettings = async (req, res) => {
  try {
    const siteId = req.body.siteId || req.wixSiteId;
    const { brandId, brandName, marketinApiKey } = req.body;
    
    const tokenRow = await findTokenForSite(siteId);
    
    if (!tokenRow) {
      return res.status(404).json({ error: 'No installation found' });
    }
    
    // Determine effective brandId: from request or existing in DB
    let effectiveBrandId = null;
    
    if (brandId) {
      // Validate brandId format if provided
      const brandIdStr = String(brandId).trim();
      if (brandIdStr === 'YOUR_BRAND_ID' || brandIdStr === 'YOUR_BRAND_ID_HERE') {
        return res.status(400).json({ error: 'Please enter a valid Market!N Brand ID' });
      }
      effectiveBrandId = brandIdStr;
    } else if (tokenRow.brand_id) {
      // Use existing brandId from DB
      effectiveBrandId = tokenRow.brand_id;
    }
    
    // brandId is required if neither request nor DB has it
    if (!effectiveBrandId) {
      return res.status(400).json({ error: 'brandId is required' });
    }
    
    // Prepare update fields
    const updateFields = {};
    
    // Only update brandId/brandName if provided in request
    if (brandId) {
      updateFields.brand_id = effectiveBrandId;
      updateFields.brand_name = brandName || null;
      updateFields.brand_configured_at = new Date();
    }

    // If marketinApiKey provided, validate it and encrypt before storing
    if (marketinApiKey && String(marketinApiKey).trim()) {
      // Validate against Market!N API before saving
      try {
        const validation = await marketinService.validateApiKey(marketinApiKey);
        if (validation.valid === false) {
          return res.status(400).json({ error: 'Invalid Market!N API key' });
        }
        // Note: validation.valid === null => could not validate (network); we still allow saving but warn
        updateFields.marketin_api_key = encrypt(marketinApiKey);
      } catch (err) {
        // Network errors or other issues; accept the key but log
        console.warn('Market!N API key validation error - saving key but could not validate', err?.message || err);
        updateFields.marketin_api_key = encrypt(marketinApiKey);
      }
    }
    
    // Only update if there's something to update
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: 'No settings to update' });
    }

    // Update the brand settings
    await knex('wix_tokens')
      .where({ id: tokenRow.id })
      .update(updateFields);
    
    // Generate the embedded script with the effective brandId
    const scriptInfo = injectService.getEmbeddedScriptInfo(effectiveBrandId);
    
    res.json({
      ok: true,
      message: 'Settings saved successfully',
      brandId: effectiveBrandId,
      brandName: brandName || tokenRow.brand_name || null,
      snippet: scriptInfo.snippet,
      instructions: scriptInfo.instructions
    });
    
    
  } catch (err) {
    console.error('updateSettings error:', err.message);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};
