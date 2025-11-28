/**
 * Admin/Monitoring Routes
 * Queue management, stats, and retry endpoints
 */
const express = require('express');
const router = express.Router();
const { getQueueStats, retryDeadJob, processQueue } = require('../services/conversionQueue.service');
const { sendDailySummary, testEmailConfig } = require('../services/alert.service');

// Simple auth middleware - use API key for admin routes
const adminAuth = (req, res, next) => {
  const apiKey = req.headers['x-admin-key'] || req.query.admin_key;
  const expectedKey = process.env.ADMIN_API_KEY;
  
  if (!expectedKey) {
    return res.status(500).json({ error: 'ADMIN_API_KEY not configured' });
  }
  
  if (apiKey !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// GET /admin/queue/stats - get queue statistics
router.get('/queue/stats', adminAuth, async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (err) {
    console.error('Failed to get queue stats:', err?.message);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// POST /admin/queue/process - manually trigger queue processing
router.post('/queue/process', adminAuth, async (req, res) => {
  try {
    const batchSize = parseInt(req.query.batch_size || '10', 10);
    const result = await processQueue(batchSize);
    res.json(result);
  } catch (err) {
    console.error('Queue processing failed:', err?.message);
    res.status(500).json({ error: 'Processing failed' });
  }
});

// POST /admin/queue/retry/:jobId - retry a dead job
router.post('/queue/retry/:jobId', adminAuth, async (req, res) => {
  try {
    const result = await retryDeadJob(req.params.jobId);
    res.json(result);
  } catch (err) {
    console.error('Retry failed:', err?.message);
    res.status(500).json({ error: 'Retry failed' });
  }
});

// POST /admin/alerts/test - test email configuration
router.post('/alerts/test', adminAuth, async (req, res) => {
  try {
    const result = await testEmailConfig();
    res.json(result);
  } catch (err) {
    console.error('Alert test failed:', err?.message);
    res.status(500).json({ error: 'Test failed' });
  }
});

// POST /admin/alerts/summary - send daily summary now
router.post('/alerts/summary', adminAuth, async (req, res) => {
  try {
    const stats = await getQueueStats();
    const result = await sendDailySummary(stats);
    res.json(result);
  } catch (err) {
    console.error('Summary failed:', err?.message);
    res.status(500).json({ error: 'Summary failed' });
  }
});

module.exports = router;
