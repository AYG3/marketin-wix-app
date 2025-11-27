const express = require('express');
const router = express.Router();
const productSyncController = require('../controllers/productSync.controller');

// POST /wix/products/sync
router.post('/products/sync', productSyncController.syncProducts);
router.post('/orders/webhook', require('../controllers/orderWebhook.controller').handleWixOrderWebhook);

module.exports = router;
