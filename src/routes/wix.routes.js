const express = require('express');
const router = express.Router();
const productSyncController = require('../controllers/productSync.controller');
const orderWebhookController = require('../controllers/orderWebhook.controller');

// POST /wix/products/sync
router.post('/products/sync', productSyncController.syncProducts);

// Order webhooks
router.post('/orders/webhook', orderWebhookController.handleWixOrderWebhook);

// Test webhook - for capturing actual Wix payload structure
// Usage: Wix Developer Center → Your App → Webhooks → Add webhook → Test Delivery
router.post('/test-webhook', orderWebhookController.handleTestWebhook);

module.exports = router;
