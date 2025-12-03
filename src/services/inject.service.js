const knex = require('../db');

/**
 * Market!N SDK Integration for Wix
 * 
 * This service generates the embedded script configuration for Wix sites.
 * The actual SDK is loaded from CDN: https://cdn.jsdelivr.net/gh/MarketIN-Inc/marketin-sdk@latest/marketin-sdk.min.js
 * 
 * The SDK handles:
 * - Affiliate click tracking (aid, cid, pid params)
 * - Page view tracking
 * - Conversion tracking
 * - Referral parameter storage (cookies + localStorage)
 */

const SDK_CDN_URL = 'https://cdn.jsdelivr.net/gh/MarketIN-Inc/marketin-sdk@latest/marketin-sdk.min.js';

/**
 * Generate the Market!N embedded script for Wix
 * This loads the SDK from CDN and initializes it with the brand configuration
 * 
 * @param {string} brandId - The brand ID for this Wix site (from Market!N platform)
 * @param {object} options - Additional configuration options
 * @param {boolean} options.debug - Enable debug mode (default: false)
 * @returns {string} The HTML script tags to embed
 */
const generateEmbeddedScript = (brandId, options = {}) => {
  const debug = options.debug ? 'true' : 'false';
  
  return `<!-- Market!N Affiliate Tracking SDK -->
<script src="${SDK_CDN_URL}"></script>
<script>
(function() {
  'use strict';
  
  function initMarketIn() {
    if (window.MarketIn) {
      MarketIn.init({
        brandId: '${brandId}',
        debug: ${debug}
      });
    } else {
      console.warn('[MarketIn] SDK not loaded from CDN');
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMarketIn);
  } else {
    initMarketIn();
  }
})();
</script>`;
};

/**
 * Generate a static embedded script template for Wix Developer Center
 * This version uses a placeholder that the brand owner will replace with their actual brandId
 * 
 * @returns {string} The HTML script tags with placeholder
 */
const generateEmbeddedScriptTemplate = () => {
  return `<!-- Market!N Affiliate Tracking SDK -->
<!-- Copy this script to your Wix Embedded Scripts extension -->
<script src="${SDK_CDN_URL}"></script>
<script>
(function() {
  'use strict';
  
  function initMarketIn() {
    if (window.MarketIn) {
      MarketIn.init({
        brandId: 'YOUR_BRAND_ID_HERE',  // Replace with your Market!N Brand ID
        debug: false
      });
    } else {
      console.warn('[MarketIn] SDK not loaded from CDN');
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMarketIn);
  } else {
    initMarketIn();
  }
})();
</script>`;
};

/**
 * Mark pixel as configured for a site and return the embedded script
 * 
 * Note: Wix apps use the "Embedded Scripts" extension configured in the
 * Wix Developer Center. Once configured, Wix automatically injects the script
 * on every page load. There's no API to manually "inject" the script - it's
 * managed by Wix's infrastructure when the app is installed.
 * 
 * This function marks the pixel as configured in the database and
 * returns the script snippet for reference.
 * 
 * @param {string} siteId - The Wix site ID
 * @param {string} accessToken - The access token (not used for SDK approach)
 * @param {string} brandId - Optional brand ID override (defaults to siteId)
 */
const injectPixel = async (siteId, accessToken, brandId = null) => {
  // Use provided brandId or fall back to siteId
  const effectiveBrandId = brandId || siteId;
  
  // Generate the embedded script
  const snippet = generateEmbeddedScript(effectiveBrandId, { debug: false });

  // Mark as configured in the database
  await knex('wix_tokens')
    .where({ site_id: siteId })
    .update({ 
      injected: true, 
      injected_at: new Date(), 
      injection_status: 'configured' 
    });

  return { 
    ok: true, 
    message: 'Pixel configured. Add the embedded script to Wix Developer Center → Extensions → Embedded Scripts.',
    snippet: snippet,
    sdkUrl: SDK_CDN_URL,
    brandId: effectiveBrandId
  };
};

/**
 * Get the embedded script snippet for a site
 * Useful for displaying in the admin UI
 * 
 * @param {string} brandId - The brand ID to use in the script
 * @returns {object} Script information
 */
const getEmbeddedScriptInfo = (brandId) => {
  return {
    sdkUrl: SDK_CDN_URL,
    snippet: generateEmbeddedScript(brandId, { debug: false }),
    template: generateEmbeddedScriptTemplate(),
    instructions: [
      '1. Go to Wix Developer Center (dev.wix.com)',
      '2. Select your app',
      '3. Go to Extensions → Site Extensions → Embedded Scripts',
      '4. Click "Add Embedded Script"',
      '5. Set placement to "Head" and pages to "All Pages"',
      '6. Paste the script snippet above',
      '7. Save and publish your app'
    ]
  };
};

module.exports = {
  injectPixel,
  generateEmbeddedScript,
  generateEmbeddedScriptTemplate,
  getEmbeddedScriptInfo,
  SDK_CDN_URL
};
