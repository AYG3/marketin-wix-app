const axios = require('axios');
require('dotenv').config();

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
