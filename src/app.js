require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
const routes = require('./routes');

const app = express();

// Request logging
// Use 'combined' for production (Apache-style logs), 'dev' for colorful development logs
const logFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(logFormat, {
  // Skip health check endpoints to reduce noise
  skip: (req, res) => req.path === '/' || req.path === '/debug/ping'
}));

app.use(cors());
// Capture raw body for webhook signature validation for JSON and text payloads
// - JSON bodies: bodyParser.json will parse and set req.rawBody via verify
// - Text bodies (e.g., 'text/plain'): bodyParser.text will parse and also set req.rawBody via verify
app.use(bodyParser.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(bodyParser.text({ type: ['text/*', 'application/*+json'], verify: (req, res, buf) => { req.rawBody = buf; }, limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, verify: (req, res, buf) => { req.rawBody = buf; } }));

// Serve static files for iframe UI (support both /iframe and /iframe-ui paths)
app.use('/iframe', express.static(path.join(__dirname, '../public/iframe-ui')));
app.use('/iframe-ui', express.static(path.join(__dirname, '../public/iframe-ui')));

// Health / sanity route (root)
app.get('/', (req, res) => {
  res.status(200).json({ message: 'OK' });
});

// Health check endpoint for Render and monitoring
// Returns 200 OK if service is healthy
app.get('/health', async (req, res) => {
  try {
    // Basic health check - verify database connection
    const knex = require('./db');
    await knex.raw('SELECT 1');
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime()
    });
  } catch (err) {
    console.error('Health check failed:', err.message || err);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: err.message || 'Unknown database error',
      details: process.env.NODE_ENV === 'development' ? err.toString() : undefined
    });
  }
});

// Mount routes
app.use('/auth', routes.auth);
app.use('/webhooks', routes.webhooks);
app.use('/inject', routes.inject);
app.use('/wix', routes.wix);
app.use('/track', routes.track);
app.use('/admin', routes.admin);
app.use('/admin/iframe', routes.iframe);
app.use('/visitor', routes.visitor);

// Debug routes - only in development
if (process.env.NODE_ENV !== 'production') {
  app.use('/debug', routes.debug);
}

module.exports = app;
