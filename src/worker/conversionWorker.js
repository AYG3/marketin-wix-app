/**
 * Conversion Queue Worker
 * Standalone worker that processes the conversion queue on a schedule
 * 
 * Usage:
 *   npm run worker        - Run continuously with polling
 *   npm run worker:once   - Process once and exit
 */
require('dotenv').config();
const { processQueue, getQueueStats } = require('../services/conversionQueue.service');
const { sendDailySummary } = require('../services/alert.service');

// Configuration
const POLL_INTERVAL_MS = parseInt(process.env.QUEUE_POLL_INTERVAL || '30000', 10); // 30 seconds
const BATCH_SIZE = parseInt(process.env.QUEUE_BATCH_SIZE || '10', 10);
const DAILY_SUMMARY_HOUR = parseInt(process.env.DAILY_SUMMARY_HOUR || '9', 10); // 9 AM

let lastSummaryDate = null;
let isRunning = true;

/**
 * Check if we should send daily summary
 */
const shouldSendDailySummary = () => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentHour = now.getHours();
  
  // Send summary at configured hour, but only once per day
  if (currentHour === DAILY_SUMMARY_HOUR && lastSummaryDate !== today) {
    lastSummaryDate = today;
    return true;
  }
  return false;
};

/**
 * Main processing loop
 */
const runWorker = async () => {
  console.log(`[Worker] Starting conversion queue worker`);
  console.log(`[Worker] Poll interval: ${POLL_INTERVAL_MS}ms, Batch size: ${BATCH_SIZE}`);

  while (isRunning) {
    try {
      // Process queue
      const result = await processQueue(BATCH_SIZE);
      
      if (result.processed > 0) {
        console.log(`[Worker] Processed ${result.processed} jobs:`, {
          succeeded: result.succeeded,
          failed: result.failed,
          dead: result.dead
        });
      }

      // Check for daily summary
      if (shouldSendDailySummary()) {
        console.log('[Worker] Sending daily summary...');
        const stats = await getQueueStats();
        await sendDailySummary(stats);
      }

    } catch (err) {
      console.error('[Worker] Error:', err?.message || err);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.log('[Worker] Stopped');
};

/**
 * Run once and exit
 */
const runOnce = async () => {
  console.log(`[Worker] Running single batch (size: ${BATCH_SIZE})`);
  
  try {
    const result = await processQueue(BATCH_SIZE);
    console.log('[Worker] Result:', result);
    
    const stats = await getQueueStats();
    console.log('[Worker] Queue stats:', stats);
    
    process.exit(0);
  } catch (err) {
    console.error('[Worker] Error:', err?.message || err);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Worker] Received SIGTERM, shutting down...');
  isRunning = false;
});

process.on('SIGINT', () => {
  console.log('[Worker] Received SIGINT, shutting down...');
  isRunning = false;
});

// Main entry point
const isOnce = process.argv.includes('--once');

if (isOnce) {
  runOnce();
} else {
  runWorker();
}
