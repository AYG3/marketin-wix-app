const express = require('express');
const router = express.Router();
const wixOAuthController = require('../controllers/wixOAuth.controller');

router.get('/wix', wixOAuthController.redirectToWix);
router.get('/wix/callback', wixOAuthController.handleCallback);

module.exports = router;
