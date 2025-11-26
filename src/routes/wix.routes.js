const express = require('express');
const router = express.Router();
const productSyncController = require('../controllers/productSync.controller');

// POST /wix/products/sync
router.post('/products/sync', productSyncController.syncProducts);

module.exports = router;
