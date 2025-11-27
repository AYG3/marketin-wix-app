const express = require('express');
const router = express.Router();
const orderWebhookController = require('../controllers/orderWebhook.controller');
const productWebhookController = require('../controllers/productWebhook.controller');

router.post('/order', orderWebhookController.handleOrderWebhook);
// Net new endpoint: Wix sends order webhooks under /wix/orders/webhook route - we've also mounted in /wix routse
router.post('/product/updated', productWebhookController.handleProductUpdated);
router.post('/product/deleted', productWebhookController.handleProductDeleted);

module.exports = router;
