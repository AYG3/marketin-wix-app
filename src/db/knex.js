/**
 * Knex Database Connection
 * Supports SQLite (development) and PostgreSQL (production)
 */
const Knex = require('knex');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Determine client: prioritize DB_CLIENT env var, then auto-detect from DATABASE_URL
let client = process.env.DB_CLIENT;
if (!client) {
  // Auto-detect based on DATABASE_URL presence
  if (process.env.DATABASE_URL) {
    client = 'pg';
  } else {
    client = 'sqlite3';
  }
}

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
  
  if (!connectionString) {
    throw new Error('DATABASE_URL or DB_CONNECTION environment variable is required for PostgreSQL');
  }
  
  connection = {
    connectionString,
    ssl: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' 
      ? { rejectUnauthorized: false } 
      : false
  };
}

const config = {
  client,
  connection,
  pool: {
    min: Number(process.env.DB_POOL_MIN || 2),
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
  acquireConnectionTimeout: 10000,
  useNullAsDefault: true,
};

const db = Knex(config);

// Log connection details on startup (redact password)
if (process.env.NODE_ENV !== 'test') {
  const logConnection = (process.env.DATABASE_URL || process.env.DB_CONNECTION || '')
    .replace(/:[^@]*@/, ':***@');
  console.log(`[DB] Connected with ${client} client${logConnection ? ': ' + logConnection : ''}`);
}

module.exports = db;
