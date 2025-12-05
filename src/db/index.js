const Knex = require('knex');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Auto-detect client based on DATABASE_URL presence
const client = process.env.DB_CLIENT || (process.env.DATABASE_URL ? 'pg' : 'sqlite3');

// Build connection config
let connection;
if (client === 'sqlite3') {
  const filename = process.env.DB_FILENAME || './data/dev.sqlite';
  const dir = path.dirname(filename);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error('Could not create sqlite data dir', err);
  }
  connection = { filename };
} else {
  // PostgreSQL - use DATABASE_URL (Railway/Render standard)
  const connectionString = process.env.DATABASE_URL || process.env.DB_CONNECTION || '';
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for PostgreSQL');
  }
  const sslEnabled = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
  connection = {
    connectionString,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false
  };
}

const config = {
  client,
  connection,
  pool: {
    min: Number(process.env.DB_POOL_MIN || 0),
    max: Number(process.env.DB_POOL_MAX || 5),
  },
  useNullAsDefault: true,
};

const db = Knex(config);

module.exports = db;
