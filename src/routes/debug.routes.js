/**
 * Debug Routes
 * Local development and testing endpoints
 * These should be disabled or protected in production
 */
const express = require('express');
const router = express.Router();
const knex = require('../db');
const { decrypt } = require('../utils/crypto');

/**
 * GET /debug/ping
 * Simple health check endpoint
 */
router.get('/ping', (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    version: require('../../package.json').version
  });
});

/**
 * GET /debug/install-check?siteId=...
 * Check installation state for a site
 */
router.get('/install-check', async (req, res) => {
  try {
    const { siteId, instanceId } = req.query;
    
    if (!siteId && !instanceId) {
      return res.status(400).json({ error: 'siteId or instanceId required' });
    }
    
    let tokenRow = null;
    if (siteId) {
      tokenRow = await knex('wix_tokens').where({ site_id: siteId }).first();
    }
    if (!tokenRow && instanceId) {
      tokenRow = await knex('wix_tokens').where({ instance_id: instanceId }).first();
    }
    
    if (!tokenRow) {
      return res.json({
        installed: false,
        message: 'No installation found'
      });
    }
    
    // Check token validity
    const now = new Date();
    const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at) : null;
    const isExpired = expiresAt ? expiresAt < now : false;
    
    res.json({
      installed: true,
      isActive: tokenRow.is_active !== false,
      siteId: tokenRow.site_id,
      instanceId: tokenRow.instance_id,
      brandId: tokenRow.brand_id || null,
      hasAccessToken: !!tokenRow.access_token,
      hasRefreshToken: !!tokenRow.refresh_token,
      tokenExpired: isExpired,
      expiresAt: expiresAt,
      pixelInjected: !!tokenRow.injected,
      injectedAt: tokenRow.injected_at,
      createdAt: tokenRow.created_at,
      lastRefreshAt: tokenRow.last_refresh_at || null,
      uninstalledAt: tokenRow.uninstalled_at || null
    });
    
  } catch (err) {
    console.error('[debug] install-check error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /debug/tokens
 * List all token records (without sensitive data)
 */
router.get('/tokens', async (req, res) => {
  try {
    const tokens = await knex('wix_tokens')
      .select(
        'id', 'site_id', 'instance_id', 'brand_id', 'is_active',
        'injected', 'injected_at', 'expires_at', 'created_at',
        'last_refresh_at', 'uninstalled_at'
      )
      .orderBy('created_at', 'desc')
      .limit(50);
    
    res.json({
      count: tokens.length,
      tokens: tokens.map(t => ({
        ...t,
        hasAccessToken: '(hidden)',
        hasRefreshToken: '(hidden)'
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /debug/products?siteId=...
 * List synced products for a site
 */
router.get('/products', async (req, res) => {
  try {
    const { siteId, limit = 20 } = req.query;
    
    let query = knex('product_mappings')
      .select('*')
      .orderBy('updated_at', 'desc')
      .limit(parseInt(limit));
    
    if (siteId) {
      query = query.where({ site_id: siteId });
    }
    
    const products = await query;
    
    res.json({
      count: products.length,
      products
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /debug/sessions?siteId=...
 * List visitor sessions
 */
router.get('/sessions', async (req, res) => {
  try {
    const { siteId, limit = 20 } = req.query;
    
    let query = knex('visitor_sessions')
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit));
    
    if (siteId) {
      query = query.where({ site_id: siteId });
    }
    
    const sessions = await query;
    
    res.json({
      count: sessions.length,
      sessions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /debug/conversions
 * List conversion queue items
 */
router.get('/conversions', async (req, res) => {
  try {
    const { status, limit = 20 } = req.query;
    
    let query = knex('conversion_queue')
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit));
    
    if (status) {
      query = query.where({ status });
    }
    
    const conversions = await query;
    
    res.json({
      count: conversions.length,
      conversions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /debug/simulate-order
 * Simulate an order webhook for testing
 */
router.post('/simulate-order', async (req, res) => {
  try {
    const orderWebhookController = require('../controllers/orderWebhook.controller');
    
    // Create a mock req/res to pass to the handler
    const mockPayload = req.body.payload || {
      id: `test-order-${Date.now()}`,
      number: 12345,
      buyerInfo: {
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User'
      },
      totals: {
        total: '99.99',
        subtotal: '89.99',
        tax: '10.00',
        currency: 'USD'
      },
      lineItems: [
        {
          id: 'item-1',
          name: 'Test Product',
          quantity: 1,
          price: '89.99',
          productId: 'prod-123'
        }
      ],
      buyerNote: req.body.buyerNote || 'ref=AFF123,cid=CAMP456',
      createdDate: new Date().toISOString()
    };
    
    // Store the simulated webhook
    await knex('order_webhooks').insert({
      payload: JSON.stringify({ simulated: true, ...mockPayload }),
      created_at: new Date()
    });
    
    res.json({
      ok: true,
      message: 'Order simulated and stored',
      orderId: mockPayload.id,
      payload: mockPayload
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /debug/trigger-refresh?siteId=...
 * Manually trigger a token refresh
 */
router.post('/trigger-refresh', async (req, res) => {
  try {
    const { siteId } = req.query;
    
    if (!siteId) {
      return res.status(400).json({ error: 'siteId required' });
    }
    
    const tokenRow = await knex('wix_tokens').where({ site_id: siteId }).first();
    
    if (!tokenRow || !tokenRow.refresh_token) {
      return res.status(404).json({ error: 'No refresh token found' });
    }
    
    const wixApi = require('../services/wixApi.service');
    const { encrypt } = require('../utils/crypto');
    
    const refreshToken = decrypt(tokenRow.refresh_token);
    const newTokens = await wixApi.refreshAccessToken(refreshToken);
    
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
      message: 'Token refreshed',
      expiresAt: newTokens.expires_at
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /debug/clear-site?siteId=...
 * Clear all data for a site (for testing clean installs)
 */
router.delete('/clear-site', async (req, res) => {
  try {
    const { siteId } = req.query;
    
    if (!siteId) {
      return res.status(400).json({ error: 'siteId required' });
    }
    
    // Delete in order to respect foreign keys if any
    const deletedProducts = await knex('product_mappings').where({ site_id: siteId }).delete();
    const deletedSessions = await knex('visitor_sessions').where({ site_id: siteId }).delete();
    const deletedTokens = await knex('wix_tokens').where({ site_id: siteId }).delete();
    
    res.json({
      ok: true,
      deleted: {
        tokens: deletedTokens,
        products: deletedProducts,
        sessions: deletedSessions
      }
    });
    
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /debug/env
 * Show non-sensitive environment info
 */
router.get('/env', (req, res) => {
  res.json({
    NODE_ENV: process.env.NODE_ENV || 'development',
    APP_URL: process.env.APP_URL || '(not set)',
    WIX_CLIENT_ID: process.env.WIX_CLIENT_ID ? '(set)' : '(not set)',
    WIX_CLIENT_SECRET: process.env.WIX_CLIENT_SECRET ? '(set)' : '(not set)',
    MARKETIN_API_URL: process.env.MARKETIN_API_URL || '(not set)',
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ? '(set)' : '(not set)',
    DATABASE: process.env.DATABASE_URL ? 'postgres' : 'sqlite'
  });
});

/**
 * POST /debug/update-settings
 * Test settings update without Wix auth (dev only)
 */
router.post('/update-settings', async (req, res) => {
  const { siteId, brandId, brandName, marketinApiKey } = req.body;
  
  if (!siteId) {
    return res.status(400).json({ error: 'siteId required' });
  }
  
  // Import controller function
  const iframeController = require('../controllers/iframe.controller');
  
  // Create mock request/response
  req.wixSiteId = siteId;
  req.body.siteId = siteId;
  
  // Call the actual updateSettings function
  return iframeController.updateSettings(req, res);
});

module.exports = router;
