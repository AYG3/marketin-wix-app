/**
 * Iframe Routes
 * API endpoints for the embedded Wix dashboard iframe
 */
const express = require('express');
const router = express.Router();
const iframeController = require('../controllers/iframe.controller');

// Apply Wix instance authentication to all iframe routes
router.use(iframeController.wixInstanceAuth);

// GET /admin/iframe/status - Get installation status
router.get('/status', iframeController.getStatus);

// POST /admin/iframe/reinject-pixel - Re-inject tracking pixel
router.post('/reinject-pixel', iframeController.reinjectPixel);

// POST /admin/iframe/refresh-token - Refresh Wix access token
router.post('/refresh-token', iframeController.refreshToken);

// GET /admin/iframe/embedded-script - Get embedded script snippet and instructions
router.get('/embedded-script', iframeController.getEmbeddedScript);

// GET /admin/iframe/settings - Get current settings
router.get('/settings', iframeController.getSettings);

// POST /admin/iframe/settings - Update settings (brandId, etc.)
router.post('/settings', iframeController.updateSettings);

module.exports = router;
