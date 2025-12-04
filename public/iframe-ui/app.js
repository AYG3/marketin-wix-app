/**
 * Market!N Dashboard - Wix Iframe UI
 * Handles communication with backend API and Wix instance validation
 */

(function() {
  'use strict';

  // Configuration
  const API_BASE = window.location.origin;
  let instanceData = null;
  let siteId = null;
  let currentBrandId = null;
  let apiKeySet = false;

  // DOM Elements
  const elements = {
    connectionStatus: document.getElementById('connection-status'),
    pixelStatus: document.getElementById('pixel-status'),
    productsCount: document.getElementById('products-count'),
    tokenStatus: document.getElementById('token-status'),
    brandIdStatus: document.getElementById('brand-id-status'),
    syncProductsBtn: document.getElementById('sync-products-btn'),
    refreshTokenBtn: document.getElementById('refresh-token-btn'),
    refreshStatusBtn: document.getElementById('refresh-status-btn'),
    activityLog: document.getElementById('activity-log'),
    toastContainer: document.getElementById('toast-container'),
    // Brand settings elements
    brandSettingsCard: document.getElementById('brand-settings-card'),
    brandIdInput: document.getElementById('brand-id-input'),
    marketinApiKeyInput: document.getElementById('marketin-api-key'),
    saveApiKeyBtn: document.getElementById('save-api-key-btn'),
    saveBrandBtn: document.getElementById('save-brand-btn'),
    brandStatus: document.getElementById('brand-status'),
    // Embedded script elements
    embedScriptCard: document.getElementById('embed-script-card'),
    embedScriptCode: document.getElementById('embed-script-code'),
    copyScriptBtn: document.getElementById('copy-script-btn'),
    setupInstructionsList: document.getElementById('setup-instructions-list')
  };

  /**
   * Parse Wix instance from URL query params
   * Wix passes ?instance=... which is a signed JWT-like token
   */
  function parseWixInstance() {
    const urlParams = new URLSearchParams(window.location.search);
    const instance = urlParams.get('instance');
    
    if (!instance) {
      log('No Wix instance found in URL', 'warning');
      return null;
    }

    try {
      // Wix instance is base64 encoded: signature.payload
      const parts = instance.split('.');
      if (parts.length >= 2) {
        // The payload is the second part, base64url encoded
        const payload = parts[1];
        // Decode base64url
        const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        const data = JSON.parse(decoded);
        log('Wix instance parsed successfully', 'success');
        return { raw: instance, data: data };
      }
    } catch (err) {
      console.error('Failed to parse Wix instance:', err);
      log('Failed to parse Wix instance', 'error');
    }
    
    return { raw: instance, data: null };
  }

  /**
   * Get headers for API calls including Wix instance for validation
   */
  function getApiHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (instanceData && instanceData.raw) {
      headers['X-Wix-Instance'] = instanceData.raw;
    }
    
    return headers;
  }

  /**
   * Log message to activity log
   */
  function log(message, type = 'info') {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false });
    
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `
      <span class="log-time">${time}</span>
      <span class="log-message">${escapeHtml(message)}</span>
    `;
    
    // Remove initial placeholder if present
    const placeholder = elements.activityLog.querySelector('.log-message');
    if (placeholder && placeholder.textContent === 'Initializing...') {
      elements.activityLog.innerHTML = '';
    }
    
    elements.activityLog.insertBefore(entry, elements.activityLog.firstChild);
    
    // Keep only last 50 entries
    while (elements.activityLog.children.length > 50) {
      elements.activityLog.removeChild(elements.activityLog.lastChild);
    }
  }

  /**
   * Show toast notification
   */
  function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Set connection status badge
   */
  function setConnectionStatus(status, text) {
    elements.connectionStatus.className = `status-badge ${status}`;
    elements.connectionStatus.querySelector('.status-text').textContent = text;
  }

  /**
   * Format date for display
   */
  function formatDate(dateStr) {
    if (!dateStr) return 'Never';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr;
    }
  }

  /**
   * Fetch installation status from backend
   */
  async function fetchStatus() {
    try {
      // Build query params - siteId is optional now
      const params = new URLSearchParams();
      if (siteId) params.set('siteId', siteId);
      
      const response = await fetch(`${API_BASE}/admin/iframe/status?${params.toString()}`, {
        method: 'GET',
        headers: getApiHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check if app is not installed
      if (!data.installed) {
        setConnectionStatus('warning', 'Not Installed');
        log(data.message || 'App not installed. Please complete OAuth installation.', 'warning');
        elements.pixelStatus.innerHTML = '<span class="status-value error">Not Installed</span>';
        elements.lastSync.innerHTML = '<span class="status-value warning">—</span>';
        elements.productsCount.innerHTML = '<span class="status-value warning">—</span>';
        elements.tokenStatus.innerHTML = '<span class="status-value error">No Token</span>';
        showToast('Please reinstall the app to connect', 'warning', 5000);
        return;
      }
      
      // Update siteId from response if we got one
      if (data.siteId && !siteId) {
        siteId = data.siteId;
        log(`Site ID: ${siteId}`, 'info');
      }
      
      updateStatusDisplay(data);
      setConnectionStatus('connected', 'Connected');
      enableButtons();
      log('Status refreshed', 'success');
      
      // Also fetch settings to get brandId
      await fetchSettings();
      
    } catch (err) {
      console.error('Failed to fetch status:', err);
      setConnectionStatus('error', 'Error');
      log(`Failed to fetch status: ${err.message}`, 'error');
      showToast('Failed to load status', 'error');
    }
  }

  /**
   * Fetch settings including brandId
   */
  async function fetchSettings() {
    try {
      const params = new URLSearchParams();
      if (siteId) params.set('siteId', siteId);
      
      const response = await fetch(`${API_BASE}/admin/iframe/settings?${params.toString()}`, {
        method: 'GET',
        headers: getApiHeaders()
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      
      if (data.brandId) {
        currentBrandId = data.brandId;
        elements.brandIdInput.value = data.brandId;
        elements.brandIdStatus.innerHTML = `<span class="status-value success">${data.brandId}</span>`;
                // API Key state
                if (data.marketinApiKeySet) {
                  apiKeySet = true;
                  // Mask the API key input with a placeholder
                  if (elements.marketinApiKeyInput) {
                    elements.marketinApiKeyInput.value = '••••••••••••••';
                  }
                  if (elements.saveApiKeyBtn) {
                    elements.saveApiKeyBtn.textContent = 'Update Key';
                  }
                }
        
        // Update card state
        elements.brandSettingsCard.classList.add('configured');
        elements.brandSettingsCard.querySelector('h2').textContent = '✓ Setup Complete';
        elements.brandSettingsCard.querySelector('.card-description').textContent = 
          'Your Market!N Brand ID is configured. The tracking SDK is ready to use.';
        
        // Show embedded script
        await fetchEmbeddedScript();
        
        log(`Brand ID configured: ${data.brandId}`, 'success');
      } else {
        elements.brandIdStatus.innerHTML = '<span class="status-value warning">Not configured</span>';
        log('Brand ID not configured - please enter your Market!N Brand ID', 'warning');
      }
      
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  }

  /**
   * Fetch and display the embedded script
   */
  async function fetchEmbeddedScript() {
    try {
      const params = new URLSearchParams();
      if (siteId) params.set('siteId', siteId);
      
      const response = await fetch(`${API_BASE}/admin/iframe/embedded-script?${params.toString()}`, {
        method: 'GET',
        headers: getApiHeaders()
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      
      if (data.snippet) {
        elements.embedScriptCode.textContent = data.snippet;
        elements.embedScriptCard.style.display = 'block';
        
        // Populate instructions
        if (data.instructions && elements.setupInstructionsList) {
          elements.setupInstructionsList.innerHTML = data.instructions
            .map(step => `<li>${escapeHtml(step)}</li>`)
            .join('');
        }
      }
      
    } catch (err) {
      console.error('Failed to fetch embedded script:', err);
    }
  }

  /**
   * Update the status display with data from API
   */
  function updateStatusDisplay(data) {
    // Pixel status
    if (data.pixelInjected) {
      elements.pixelStatus.innerHTML = '<span class="status-value success">✓ Configured</span>';
    } else {
      elements.pixelStatus.innerHTML = '<span class="status-value warning">Pending setup</span>';
    }

    // Products count
    elements.productsCount.innerHTML = data.productsCount !== undefined
      ? data.productsCount.toString()
      : '<span class="status-value warning">—</span>';

    // Token status
    if (data.tokenValid) {
      const expiresText = data.tokenExpiresAt 
        ? ` (expires ${formatDate(data.tokenExpiresAt)})`
        : '';
      elements.tokenStatus.innerHTML = `<span class="status-value success">✓ Valid${expiresText}</span>`;
    } else if (data.tokenExpired) {
      elements.tokenStatus.innerHTML = '<span class="status-value error">✗ Expired</span>';
    } else {
      elements.tokenStatus.innerHTML = '<span class="status-value warning">Unknown</span>';
    }
  }

  /**
   * Enable action buttons after status is loaded
   */
  function enableButtons() {
    elements.syncProductsBtn.disabled = false;
    elements.refreshTokenBtn.disabled = false;
  }

  /**
   * Handle saving brand ID
   */
  async function handleSaveBrandId() {
    const brandId = elements.brandIdInput.value.trim();
    
    if (!brandId) {
      showBrandStatus('Please enter your Market!N Brand ID', 'error');
      return;
    }
    
    const btn = elements.saveBrandBtn;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-text">Saving...</span>';
    log('Saving Brand ID...', 'info');
    
    try {
      const response = await fetch(`${API_BASE}/admin/iframe/settings`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ siteId: siteId, brandId: brandId })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      
      currentBrandId = brandId;
      
      // Update UI
      showBrandStatus('Brand ID saved successfully!', 'success');
      elements.brandSettingsCard.classList.add('configured');
      elements.brandSettingsCard.querySelector('h2').textContent = '✓ Setup Complete';
      elements.brandSettingsCard.querySelector('.card-description').textContent = 
        'Your Market!N Brand ID is configured. The tracking SDK is ready to use.';
      elements.brandIdStatus.innerHTML = `<span class="status-value success">${brandId}</span>`;
      
      // Show embedded script
      if (data.snippet) {
        elements.embedScriptCode.textContent = data.snippet;
        elements.embedScriptCard.style.display = 'block';
        
        if (data.instructions && elements.setupInstructionsList) {
          elements.setupInstructionsList.innerHTML = data.instructions
            .map(step => `<li>${escapeHtml(step)}</li>`)
            .join('');
        }
      }
      
      log(`Brand ID saved: ${brandId}`, 'success');
      showToast('Brand ID saved!', 'success');
      
    } catch (err) {
      console.error('Failed to save Brand ID:', err);
      showBrandStatus(err.message, 'error');
      log(`Failed to save Brand ID: ${err.message}`, 'error');
      showToast('Failed to save', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-text">Save</span>';
    }
  }

  /**
   * Handle saving Market!N API Key
   */
  async function handleSaveApiKey() {
    const key = elements.marketinApiKeyInput.value.trim();
    if (!key) {
      showBrandStatus('Please enter your Market!N API key', 'error');
      return;
    }
    const btn = elements.saveApiKeyBtn;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-text">Saving...</span>';
    log('Saving Market!N API key...', 'info');

    try {
      const response = await fetch(`${API_BASE}/admin/iframe/settings`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ siteId: siteId, marketinApiKey: key })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

      apiKeySet = true;
      // Mask value
      elements.marketinApiKeyInput.value = '••••••••••••••';
      showBrandStatus('Market!N API key saved successfully', 'success');
      log('Market!N API key saved', 'success');
      showToast('API key saved!', 'success');
    } catch (err) {
      console.error('Failed to save API key:', err);
      showBrandStatus(err.message, 'error');
      log('Failed to save Market!N API key', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-text">Save Key</span>';
    }
  }

  /**
   * Show status message in brand settings card
   */
  function showBrandStatus(message, type) {
    elements.brandStatus.textContent = message;
    elements.brandStatus.className = `brand-status ${type}`;
    
    // Auto-hide success messages
    if (type === 'success') {
      setTimeout(() => {
        elements.brandStatus.className = 'brand-status';
      }, 5000);
    }
  }

  /**
   * Copy embedded script to clipboard
   */
  async function handleCopyScript() {
    try {
      const script = elements.embedScriptCode.textContent;
      await navigator.clipboard.writeText(script);
      
      const btn = elements.copyScriptBtn;
      btn.innerHTML = '<span class="btn-icon">✓</span><span class="btn-text">Copied!</span>';
      showToast('Script copied to clipboard', 'success');
      log('Embedded script copied to clipboard', 'success');
      
      setTimeout(() => {
        btn.innerHTML = '<span class="btn-icon">📋</span><span class="btn-text">Copy</span>';
      }, 2000);
      
    } catch (err) {
      showToast('Failed to copy', 'error');
    }
  }

  /**
   * Handle product sync
   */
  async function handleSyncProducts() {
    if (!siteId) {
      showToast('No site ID available', 'error');
      return;
    }

    const btn = elements.syncProductsBtn;
    btn.disabled = true;
    btn.classList.add('loading');
    log('Starting product sync...', 'info');

    try {
      const response = await fetch(`${API_BASE}/wix/products/sync`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ siteId: siteId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      log(`Product sync completed: ${data.count || 0} products`, 'success');
      showToast(`Synced ${data.count || 0} products`, 'success');
      
      // Refresh status to show updated count
      await fetchStatus();
      
    } catch (err) {
      console.error('Product sync failed:', err);
      log(`Product sync failed: ${err.message}`, 'error');
      showToast('Sync failed', 'error');
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }

  /**
   * Handle token refresh
   */
  async function handleRefreshToken() {
    if (!siteId) {
      showToast('No site ID available', 'error');
      return;
    }

    const btn = elements.refreshTokenBtn;
    btn.disabled = true;
    btn.classList.add('loading');
    log('Refreshing access token...', 'info');

    try {
      const response = await fetch(`${API_BASE}/admin/iframe/refresh-token`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ siteId: siteId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      log('Access token refreshed successfully', 'success');
      showToast('Token refreshed', 'success');
      
      // Refresh status
      await fetchStatus();
      
    } catch (err) {
      console.error('Token refresh failed:', err);
      log(`Token refresh failed: ${err.message}`, 'error');
      showToast('Refresh failed', 'error');
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }

  /**
   * Initialize the dashboard
   */
  function init() {
    log('Initializing Market!N Dashboard...', 'info');
    
    // Parse Wix instance
    instanceData = parseWixInstance();
    
    if (instanceData && instanceData.data) {
      siteId = instanceData.data.siteId || instanceData.data.site_id || instanceData.data.instanceId;
      if (siteId) {
        log(`Site ID: ${siteId}`, 'info');
      }
    }
    
    // Also check for direct siteId query param (for testing)
    if (!siteId) {
      const urlParams = new URLSearchParams(window.location.search);
      siteId = urlParams.get('siteId') || urlParams.get('site_id');
      if (siteId) {
        log(`Site ID from query: ${siteId}`, 'info');
      }
    }

    // Bind event listeners
    elements.syncProductsBtn.addEventListener('click', handleSyncProducts);
    elements.refreshTokenBtn.addEventListener('click', handleRefreshToken);
    elements.refreshStatusBtn.addEventListener('click', () => {
      log('Refreshing status...', 'info');
      fetchStatus();
    });
    
    // Brand settings event listeners
    elements.saveBrandBtn.addEventListener('click', handleSaveBrandId);
    if (elements.saveApiKeyBtn) elements.saveApiKeyBtn.addEventListener('click', handleSaveApiKey);
    elements.brandIdInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSaveBrandId();
    });
    elements.copyScriptBtn.addEventListener('click', handleCopyScript);

    // Always try to fetch status - backend will handle missing siteId
    fetchStatus();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
