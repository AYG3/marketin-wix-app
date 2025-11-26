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

module.exports = {
  exchangeCodeForToken,
  injectHeadScript,
};
