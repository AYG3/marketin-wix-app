const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const knex = require('../db');
const productSyncController = require('../controllers/productSync.controller');

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const queueName = 'product-sync-queue';
const queue = new Queue(queueName, { connection });

// Worker: process jobs
new Worker(queueName, async job => {
  // job.data: { siteId, brandId, apiKey }
  const { siteId, brandId, apiKey } = job.data;
  // create a fake request/res object to reuse controller code (not ideal but simple)
  const req = { body: { siteId, brandId, apiKey } };
  const res = {
    status: (code) => ({ json: (data) => ({ code, data }) }),
    json: (data) => data,
  };
  try {
    const result = await productSyncController.syncProducts(req, res);
    return result;
  } catch (err) {
    throw err;
  }
}, { connection });

module.exports = { queue };
