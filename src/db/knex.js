/**
 * Knex Database Connection
 * Supports SQLite (development) and PostgreSQL (production)
 */
const Knex = require('knex');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const client = process.env.DB_CLIENT || 'sqlite3';

// Build connection config based on client type
let connection;
if (client === 'sqlite3') {
  const filename = process.env.DB_FILENAME || './data/dev.sqlite';
  // Ensure directory exists for SQLite
  const dir = path.dirname(filename);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.error('Could not create sqlite data dir', err);
  }
  connection = { filename };
} else {
  // PostgreSQL - prioritize DATABASE_URL (Render), then DB_CONNECTION
  const connectionString = process.env.DATABASE_URL || process.env.DB_CONNECTION || '';
  connection = {
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  };
}

const config = {
  client,
  connection,
  pool: {
    min: Number(process.env.DB_POOL_MIN || 2),
    max: Number(process.env.DB_POOL_MAX || 10),
  },
  useNullAsDefault: true,
};

const db = Knex(config);

module.exports = db;
