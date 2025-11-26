const axios = require('axios');

const exchangeCodeForToken = async (code) => {
  // Placeholder: implement actual token exchange with Wix API (requires client id/secret)
  // For now, return a mocked token response structure to continue scaffold work
  return {
    client_id: process.env.WIX_CLIENT_ID,
    access_token: `mock_access_token_${code}`,
    refresh_token: `mock_refresh_token_${code}`,
    expires_at: new Date(Date.now() + 60 * 60 * 1000),
  };
};

module.exports = {
  exchangeCodeForToken,
};
