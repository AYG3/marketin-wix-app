const express = require('express');
const router = express.Router();
const orderWebhookController = require('../controllers/orderWebhook.controller');

router.post('/order', orderWebhookController.handleOrderWebhook);

module.exports = router;
