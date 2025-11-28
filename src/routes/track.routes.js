/**
 * Tracking Routes
 * Endpoints for visitor session tracking and affiliate attribution
 */
const express = require('express');
const router = express.Router();
const visitorSessionController = require('../controllers/visitorSession.controller');

// POST /track/session - capture visitor session with affiliate info
router.post('/session', visitorSessionController.trackSession);

// GET /track/session/:sessionId - retrieve session info
router.get('/session/:sessionId', visitorSessionController.getSession);

module.exports = router;
