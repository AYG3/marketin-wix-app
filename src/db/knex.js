const knex = require('knex');
require('dotenv').config();

const client = process.env.DB_CLIENT || 'sqlite3';

const config = {
  client,
  connection: client === 'sqlite3' ? { filename: process.env.DB_FILENAME || './data/dev.sqlite' } : (process.env.DB_CONNECTION || ''),
  pool: {
    min: Number(process.env.DB_POOL_MIN || 2),
    max: Number(process.env.DB_POOL_MAX || 10),
  },
  useNullAsDefault: true,
};

// Ensure DB directory exists (useful for sqlite3)
const fs = require('fs');
const path = require('path');
if (client === 'sqlite3') {
  const filename = (config.connection && config.connection.filename) || './data/dev.sqlite';
  const dir = path.dirname(filename);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error('Could not create sqlite data dir', err);
  }
}

const db = knex(config);

// Helper: ensure our minimal schema exists - this is for development scaffolding only.
(async () => {
  try {
    const hasTokens = await db.schema.hasTable('wix_tokens');
    if (!hasTokens) {
      await db.schema.createTable('wix_tokens', (table) => {
        table.increments('id');
        table.string('wix_client_id');
        table.text('access_token');
        table.text('refresh_token');
        table.timestamp('expires_at');
        table.timestamp('created_at');
      });
    }

    const hasOrderWebhooks = await db.schema.hasTable('order_webhooks');
    if (!hasOrderWebhooks) {
      await db.schema.createTable('order_webhooks', (table) => {
        table.increments('id');
        table.text('payload');
        table.timestamp('processed_at');
        table.timestamp('created_at');
      });
    }
  } catch (err) {
    console.error('knex init error', err);
  }
})();

module.exports = db;
