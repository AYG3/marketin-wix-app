const express = require('express');
const router = express.Router();
const productSyncController = require('../controllers/productSync.controller');
const orderWebhookController = require('../controllers/orderWebhook.controller');
const uninstallController = require('../controllers/uninstall.controller');

// POST /wix/products/sync
router.post('/products/sync', productSyncController.syncProducts);

// Order webhooks
router.post('/orders/webhook', orderWebhookController.handleWixOrderWebhook);

// Test webhook - for capturing actual Wix payload structure
// Usage: Wix Developer Center → Your App → Webhooks → Add webhook → Test Delivery
router.post('/test-webhook', orderWebhookController.handleTestWebhook);

// Uninstall webhook - called by Wix when app is removed from a site
// Register this URL in Wix Dev Center: POST https://your-domain.com/wix/uninstall
router.post('/uninstall', uninstallController.handleUninstall);
router.post('/app-removed', uninstallController.handleAppRemoved);

module.exports = router;
