const express = require('express');
const router = express.Router();
const wixOAuthController = require('../controllers/wixOAuth.controller');

// install -> redirect to Wix OAuth
router.get('/install', wixOAuthController.redirectToWix);
// callback after user authorizes the app
router.get('/callback', wixOAuthController.handleCallback);

module.exports = router;
