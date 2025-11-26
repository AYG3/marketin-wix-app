const axios = require('axios');
const wixApi = require('../services/wixApi.service');
const knex = require('../db/knex');

// Redirect user to Wix OAuth consent
exports.redirectToWix = async (req, res) => {
  const clientId = process.env.WIX_CLIENT_ID;
  const redirectUri = process.env.WIX_REDIRECT_URI;
  const wixOAuthUrl = `https://www.wix.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=stores.read,stores.write`;
  res.redirect(wixOAuthUrl);
};

// Handle Wix OAuth callback and store tokens
exports.handleCallback = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    // Exchange code for access token (placeholder)
    const tokenResp = await wixApi.exchangeCodeForToken(code);

    // Save token to DB
    await knex('wix_tokens').insert({
      wix_client_id: tokenResp.client_id || 'unknown',
      access_token: tokenResp.access_token,
      refresh_token: tokenResp.refresh_token,
      expires_at: tokenResp.expires_at || null,
      created_at: new Date()
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('handleCallback err', err);
    res.status(500).json({ error: 'OAuth callback failed' });
  }
};
