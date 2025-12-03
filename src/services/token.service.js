/**
 * Token Service
 * Manages Wix OAuth tokens with automatic refresh
 */
const knex = require('../db');
const { encrypt, decrypt } = require('../utils/crypto');
const wixApi = require('./wixApi.service');

/**
 * Get decrypted tokens for a site
 * @param {string} siteId - The Wix site ID
 * @returns {Object} - { accessToken, refreshToken, expiresAt, isExpired }
 */
const getTokens = async (siteId) => {
  const tokenRow = await knex('wix_tokens')
    .where({ site_id: siteId, is_active: true })
    .first();

  if (!tokenRow) {
    throw new Error(`No active token found for site ${siteId}`);
  }

  const accessToken = tokenRow.access_token ? decrypt(tokenRow.access_token) : null;
  const refreshToken = tokenRow.refresh_token ? decrypt(tokenRow.refresh_token) : null;
  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at) : null;
  const isExpired = expiresAt ? expiresAt < new Date() : false;

  return {
    accessToken,
    refreshToken,
    expiresAt,
    isExpired,
    siteId: tokenRow.site_id,
    instanceId: tokenRow.instance_id,
  };
};

/**
 * Update tokens in database after refresh
 * @param {string} siteId - The Wix site ID
 * @param {Object} newTokens - { access_token, refresh_token, expires_in, expires_at }
 */
const updateTokens = async (siteId, newTokens) => {
  const updateData = {
    last_refresh_at: new Date(),
  };

  if (newTokens.access_token) {
    updateData.access_token = encrypt(newTokens.access_token);
  }

  if (newTokens.refresh_token) {
    updateData.refresh_token = encrypt(newTokens.refresh_token);
  }

  if (newTokens.expires_in) {
    updateData.expires_in = newTokens.expires_in;
    updateData.expires_at = new Date(Date.now() + newTokens.expires_in * 1000);
  } else if (newTokens.expires_at) {
    updateData.expires_at = newTokens.expires_at;
  }

  await knex('wix_tokens')
    .where({ site_id: siteId })
    .update(updateData);

  console.log(`[tokenService] Updated tokens for site ${siteId}`);
};

/**
 * Refresh tokens if expired or about to expire
 * @param {string} siteId - The Wix site ID
 * @param {number} bufferSeconds - Refresh if expiring within this many seconds (default: 5 min)
 * @returns {Object} - Fresh tokens
 */
const ensureFreshTokens = async (siteId, bufferSeconds = 300) => {
  const tokens = await getTokens(siteId);

  // Check if refresh is needed
  const now = new Date();
  const bufferMs = bufferSeconds * 1000;
  const needsRefresh = tokens.expiresAt && (tokens.expiresAt.getTime() - now.getTime() < bufferMs);

  if (needsRefresh || tokens.isExpired) {
    console.log(`[tokenService] Token expired or expiring soon for site ${siteId}, refreshing...`);
    
    if (!tokens.refreshToken) {
      throw new Error('Cannot refresh: no refresh token available');
    }

    const newTokens = await wixApi.refreshAccessToken(tokens.refreshToken);
    await updateTokens(siteId, newTokens);

    return {
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || tokens.refreshToken,
      expiresAt: newTokens.expires_at,
      wasRefreshed: true,
    };
  }

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    wasRefreshed: false,
  };
};

/**
 * Get token getter/updater functions for use with wixApi.withTokenRefresh
 * @param {string} siteId - The Wix site ID
 */
const getTokenHelpers = (siteId) => ({
  siteId, // Include siteId for logging in withTokenRefresh
  getTokenFn: async () => {
    const tokens = await getTokens(siteId);
    return tokens;
  },
  updateTokenFn: async (_, newTokens) => {
    await updateTokens(siteId, newTokens);
  },
});

/**
 * Mark a site's tokens as requiring re-authentication
 * Called when refresh fails and user needs to re-install
 */
const markTokenInvalid = async (siteId) => {
  await knex('wix_tokens')
    .where({ site_id: siteId })
    .update({
      is_active: false,
      access_token: null,
      refresh_token: null,
    });

  console.log(`[tokenService] Marked tokens as invalid for site ${siteId}`);
};

module.exports = {
  getTokens,
  updateTokens,
  ensureFreshTokens,
  getTokenHelpers,
  markTokenInvalid,
};
