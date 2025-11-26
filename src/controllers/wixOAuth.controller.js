const axios = require('axios');
const wixApi = require('../services/wixApi.service');
const injectService = require('../services/inject.service');
const knex = require('../db/knex');

// Redirect user to Wix OAuth consent
exports.redirectToWix = async (req, res) => {
  const clientId = process.env.WIX_CLIENT_ID;
  const redirectUri = process.env.WIX_REDIRECT_URI;
  const scopes = 'site.read,stores.read,stores.write';
  const wixOAuthUrl = `https://www.wix.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
  res.redirect(wixOAuthUrl);
};

// Handle Wix OAuth callback and store tokens
exports.handleCallback = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    // Exchange code for access token
    const tokenResp = await wixApi.exchangeCodeForToken(code);

    // Save token to DB. Include site_id & instance_id if provided.
    const tokenRecord = {
      wix_client_id: tokenResp.client_id || process.env.WIX_CLIENT_ID || 'unknown',
      access_token: tokenResp.access_token,
      refresh_token: tokenResp.refresh_token,
      expires_at: tokenResp.expires_at || null,
      site_id: tokenResp.site_id || null,
      instance_id: tokenResp.instance_id || null,
      injected: false,
      injected_at: null,
      created_at: new Date()
    };

    await knex('wix_tokens').insert(tokenRecord);

    // Attempt post-install actions (non-blocking)
    if (tokenResp.site_id && tokenResp.access_token) {
      try {
        await injectService.injectPixel(tokenResp.site_id, tokenResp.access_token);
      } catch (err) {
        console.error('injectPixel failed', err);
      }
    }

    // Respond with friendly HTML page
    res.status(200).send(`<!doctype html><html><head><title>Market!N Installed</title></head><body><h1>Market!N installed — return to Wix</h1><p>You can close this window.</p></body></html>`);
  } catch (err) {
    console.error('handleCallback err', err?.response?.data || err.message || err);
    res.status(500).json({ error: 'OAuth callback failed' });
  }
};
