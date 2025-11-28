/**
 * Conversion Queue Service
 * DB-backed queue with exponential backoff retry for Market!N conversion sends
 */
const knex = require('../db');
const crypto = require('crypto');
const { sendConversionDirect } = require('./marketin.service');
const alertService = require('./alert.service');

// Retry delays in seconds: 30s, 2m, 8m, 32m, 2h
const BACKOFF_DELAYS = [30, 120, 480, 1920, 7200];
const MAX_ATTEMPTS = 5;

/**
 * Enqueue a conversion for sending with retry support
 * @param {Object} conversionPayload - Full conversion payload
 * @param {number} orderWebhookId - Reference to stored webhook
 * @returns {Object} Queue job info
 */
const enqueueConversion = async (conversionPayload, orderWebhookId = null) => {
  const jobId = conversionPayload.externalOrderId 
    ? `conv_${conversionPayload.brandId}_${conversionPayload.externalOrderId}`
    : `conv_${crypto.randomUUID()}`;

  // Check for existing job (idempotency)
  const existing = await knex('conversion_queue')
    .where('job_id', jobId)
    .first();

  if (existing) {
    // If already completed or dead, don't re-queue
    if (['completed', 'dead'].includes(existing.status)) {
      return { jobId, status: existing.status, message: 'Already processed' };
    }
    // If pending/processing/failed, return existing
    return { jobId, status: existing.status, message: 'Already queued' };
  }

  // Insert new job
  const [id] = await knex('conversion_queue').insert({
    job_id: jobId,
    status: 'pending',
    attempts: 0,
    max_attempts: MAX_ATTEMPTS,
    next_retry_at: new Date(), // immediately available
    payload: JSON.stringify(conversionPayload),
    order_webhook_id: orderWebhookId,
    created_at: new Date()
  });

  return { id, jobId, status: 'pending', message: 'Queued' };
};

/**
 * Process pending jobs from queue
 * Called by worker/cron or inline for immediate processing
 * @param {number} batchSize - Max jobs to process
 * @returns {Object} Processing results
 */
const processQueue = async (batchSize = 10) => {
  const now = new Date();
  
  // Fetch jobs ready for processing
  const jobs = await knex('conversion_queue')
    .whereIn('status', ['pending', 'failed'])
    .where('next_retry_at', '<=', now)
    .where('attempts', '<', MAX_ATTEMPTS)
    .orderBy('next_retry_at', 'asc')
    .limit(batchSize);

  const results = { processed: 0, succeeded: 0, failed: 0, dead: 0 };

  for (const job of jobs) {
    results.processed++;

    // Mark as processing
    await knex('conversion_queue')
      .where('id', job.id)
      .update({
        status: 'processing',
        last_attempted_at: now
      });

    try {
      const payload = JSON.parse(job.payload);
      const response = await sendConversionDirect(payload);

      // Success!
      await knex('conversion_queue')
        .where('id', job.id)
        .update({
          status: 'completed',
          attempts: job.attempts + 1,
          completed_at: new Date()
        });

      results.succeeded++;
    } catch (err) {
      const attempts = job.attempts + 1;
      const errorMessage = err?.response?.data?.message || err?.message || String(err);
      const httpStatus = err?.response?.status;
      const errorCode = err?.code || (httpStatus ? `HTTP_${httpStatus}` : 'UNKNOWN');

      // Check if we should retry or mark as dead
      const isRetryable = isRetryableError(err);
      const shouldRetry = isRetryable && attempts < MAX_ATTEMPTS;

      if (shouldRetry) {
        // Calculate next retry with exponential backoff
        const delaySeconds = BACKOFF_DELAYS[Math.min(attempts - 1, BACKOFF_DELAYS.length - 1)];
        const nextRetryAt = new Date(Date.now() + delaySeconds * 1000);

        await knex('conversion_queue')
          .where('id', job.id)
          .update({
            status: 'failed',
            attempts,
            next_retry_at: nextRetryAt,
            last_error: errorMessage,
            error_code: errorCode
          });

        results.failed++;
      } else {
        // Mark as dead (no more retries)
        await knex('conversion_queue')
          .where('id', job.id)
          .update({
            status: 'dead',
            attempts,
            last_error: errorMessage,
            error_code: errorCode
          });

        // Log to failures table
        await logFailure(job, errorMessage, errorCode, httpStatus, err?.response?.data);

        // Send alert
        await alertService.sendConversionFailureAlert({
          jobId: job.job_id,
          payload: job.payload,
          error: errorMessage,
          attempts
        });

        results.dead++;
      }
    }
  }

  return results;
};

/**
 * Determine if an error is retryable
 */
const isRetryableError = (err) => {
  const status = err?.response?.status;
  
  // Network errors are retryable
  if (!status) return true;
  
  // 5xx errors are retryable
  if (status >= 500) return true;
  
  // 429 Too Many Requests is retryable
  if (status === 429) return true;
  
  // 408 Request Timeout is retryable
  if (status === 408) return true;
  
  // 4xx errors (except 429, 408) are not retryable (bad request, auth issues)
  if (status >= 400 && status < 500) return false;
  
  return true;
};

/**
 * Log a permanent failure for monitoring
 */
const logFailure = async (job, errorMessage, errorCode, httpStatus, responseBody) => {
  try {
    await knex('conversion_failures').insert({
      queue_id: job.id,
      job_id: job.job_id,
      payload: job.payload,
      error_message: errorMessage,
      error_code: errorCode,
      http_status: httpStatus,
      response_body: responseBody ? JSON.stringify(responseBody) : null,
      alert_sent: false,
      created_at: new Date()
    });
  } catch (err) {
    console.error('Failed to log conversion failure', err?.message || err);
  }
};

/**
 * Get queue statistics for monitoring
 */
const getQueueStats = async () => {
  const stats = await knex('conversion_queue')
    .select('status')
    .count('* as count')
    .groupBy('status');

  const failures24h = await knex('conversion_failures')
    .where('created_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
    .count('* as count')
    .first();

  return {
    queue: Object.fromEntries(stats.map(s => [s.status, parseInt(s.count, 10)])),
    failures24h: parseInt(failures24h?.count || 0, 10)
  };
};

/**
 * Retry a dead job manually
 */
const retryDeadJob = async (jobId) => {
  const job = await knex('conversion_queue')
    .where('job_id', jobId)
    .where('status', 'dead')
    .first();

  if (!job) {
    return { success: false, message: 'Job not found or not dead' };
  }

  await knex('conversion_queue')
    .where('id', job.id)
    .update({
      status: 'pending',
      attempts: 0,
      next_retry_at: new Date(),
      last_error: null,
      error_code: null
    });

  return { success: true, message: 'Job requeued' };
};

module.exports = {
  enqueueConversion,
  processQueue,
  getQueueStats,
  retryDeadJob,
  MAX_ATTEMPTS,
  BACKOFF_DELAYS
};
