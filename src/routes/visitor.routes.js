/**
 * Visitor Routes
 * Endpoints for visitor identification and session linking
 */
const express = require('express');
const router = express.Router();
const visitorSessionController = require('../controllers/visitorSession.controller');

// POST /visitor/identify - link visitor session to email/identifier (signup/checkout)
router.post('/identify', visitorSessionController.identifyVisitor);

// POST /visitor/session - alias for /track/session (for SDK convenience)
router.post('/session', visitorSessionController.trackSession);

module.exports = router;
