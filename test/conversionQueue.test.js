const knex = require('../src/db');

// Mock alert service to avoid actual emails
jest.mock('../src/services/alert.service', () => ({
  sendConversionFailureAlert: jest.fn().mockResolvedValue({ sent: false, reason: 'mocked' }),
  sendDailySummary: jest.fn().mockResolvedValue({ sent: false, reason: 'mocked' }),
  testEmailConfig: jest.fn().mockResolvedValue({ configured: false })
}));

// Mock the direct send function
jest.mock('../src/services/marketin.service', () => ({
  sendConversionDirect: jest.fn(),
  sendConversion: jest.fn(),
  bulkSyncProducts: jest.fn()
}));

const { enqueueConversion, processQueue, getQueueStats, retryDeadJob } = require('../src/services/conversionQueue.service');
const marketinService = require('../src/services/marketin.service');

describe('Conversion Queue Service', () => {
  beforeAll(async () => await knex.migrate.latest());
  afterEach(async () => {
    await knex('conversion_queue').del();
    await knex('conversion_failures').del();
    jest.clearAllMocks();
  });
  afterAll(async () => { 
    await knex.migrate.rollback(); 
    await knex.destroy(); 
  });

  test('enqueueConversion creates new job', async () => {
    const payload = {
      brandId: 123,
      externalOrderId: 'order-001',
      amount: 99.99,
      currency: 'USD',
      affiliateId: 'AFF-001'
    };

    const result = await enqueueConversion(payload);

    expect(result.status).toBe('pending');
    expect(result.jobId).toContain('order-001');

    // Verify in database
    const job = await knex('conversion_queue').where('job_id', result.jobId).first();
    expect(job).toBeDefined();
    expect(job.status).toBe('pending');
  });

  test('enqueueConversion is idempotent', async () => {
    const payload = {
      brandId: 123,
      externalOrderId: 'order-idem',
      amount: 50,
      affiliateId: 'AFF-002'
    };

    const result1 = await enqueueConversion(payload);
    const result2 = await enqueueConversion(payload);

    expect(result1.jobId).toBe(result2.jobId);
    expect(result2.message).toBe('Already queued');

    // Should only have one job
    const count = await knex('conversion_queue').where('job_id', result1.jobId).count('* as cnt');
    expect(parseInt(count[0].cnt, 10)).toBe(1);
  });

  test('processQueue processes pending jobs successfully', async () => {
    // Mock successful API call
    marketinService.sendConversionDirect.mockResolvedValueOnce({
      success: true,
      conversionId: 999
    });

    const payload = {
      brandId: 123,
      externalOrderId: 'order-success',
      amount: 75,
      affiliateId: 'AFF-003'
    };

    await enqueueConversion(payload);
    const result = await processQueue(10);

    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);

    // Job should be marked completed
    const job = await knex('conversion_queue').where('job_id', `conv_123_order-success`).first();
    expect(job.status).toBe('completed');
  });

  test('processQueue retries failed jobs with backoff', async () => {
    // Mock failed API call
    const err = new Error('Service unavailable');
    err.response = { status: 503 };
    marketinService.sendConversionDirect.mockRejectedValueOnce(err);

    const payload = {
      brandId: 123,
      externalOrderId: 'order-retry',
      amount: 100,
      affiliateId: 'AFF-004'
    };

    await enqueueConversion(payload);
    const result = await processQueue(10);

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);

    // Job should be marked failed with next_retry_at set
    const job = await knex('conversion_queue').where('job_id', `conv_123_order-retry`).first();
    expect(job.status).toBe('failed');
    expect(job.attempts).toBe(1);
    // next_retry_at should be set (non-null)
    expect(job.next_retry_at).toBeTruthy();
  });

  test('processQueue marks non-retryable errors as dead', async () => {
    // Mock 400 error (not retryable)
    const err = new Error('Bad request');
    err.response = { status: 400, data: { message: 'Invalid payload' } };
    marketinService.sendConversionDirect.mockRejectedValueOnce(err);

    const payload = {
      brandId: 123,
      externalOrderId: 'order-dead',
      amount: 25,
      affiliateId: 'AFF-005'
    };

    await enqueueConversion(payload);
    const result = await processQueue(10);

    expect(result.processed).toBe(1);
    expect(result.dead).toBe(1);

    // Job should be marked dead
    const job = await knex('conversion_queue').where('job_id', `conv_123_order-dead`).first();
    expect(job.status).toBe('dead');

    // Should have failure record
    const failure = await knex('conversion_failures').where('job_id', `conv_123_order-dead`).first();
    expect(failure).toBeDefined();
  });

  test('getQueueStats returns correct counts', async () => {
    // Create jobs in different states
    await knex('conversion_queue').insert([
      { job_id: 'pending-1', status: 'pending', payload: '{}', created_at: new Date() },
      { job_id: 'pending-2', status: 'pending', payload: '{}', created_at: new Date() },
      { job_id: 'completed-1', status: 'completed', payload: '{}', created_at: new Date() },
      { job_id: 'dead-1', status: 'dead', payload: '{}', created_at: new Date() }
    ]);

    const stats = await getQueueStats();

    expect(stats.queue.pending).toBe(2);
    expect(stats.queue.completed).toBe(1);
    expect(stats.queue.dead).toBe(1);
  });

  test('retryDeadJob requeues dead job', async () => {
    await knex('conversion_queue').insert({
      job_id: 'dead-retry',
      status: 'dead',
      attempts: 5,
      payload: '{}',
      last_error: 'Previous error',
      created_at: new Date()
    });

    const result = await retryDeadJob('dead-retry');

    expect(result.success).toBe(true);

    const job = await knex('conversion_queue').where('job_id', 'dead-retry').first();
    expect(job.status).toBe('pending');
    expect(job.attempts).toBe(0);
    expect(job.last_error).toBeNull();
  });
});
