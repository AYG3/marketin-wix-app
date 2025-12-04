/**
 * Knex Database Connection
 * Supports SQLite (development) and PostgreSQL (production)
 */
const Knex = require('knex');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Log diagnostic info
console.log('[DB] Initializing database connection...');
console.log('[DB] DB_CLIENT env:', process.env.DB_CLIENT || 'not set');
console.log('[DB] DATABASE_URL:', process.env.DATABASE_URL ? 'present' : 'missing');
console.log('[DB] NODE_ENV:', process.env.NODE_ENV || 'not set');

// Determine client: prioritize DB_CLIENT env var, then auto-detect from DATABASE_URL
let client = process.env.DB_CLIENT;
if (!client) {
  // Auto-detect based on DATABASE_URL presence
  if (process.env.DATABASE_URL) {
    client = 'pg';
    console.log('[DB] Auto-detected PostgreSQL from DATABASE_URL');
  } else {
    client = 'sqlite3';
    console.log('[DB] Defaulting to SQLite (no DATABASE_URL found)');
  }
} else {
  console.log('[DB] Using explicit DB_CLIENT:', client);
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
  console.log('[DB] SQLite file:', filename);
} else {
  // PostgreSQL - prioritize DATABASE_URL (Render), then DB_CONNECTION
  const connectionString = process.env.DATABASE_URL || process.env.DB_CONNECTION || '';
  
  if (!connectionString) {
    const error = 'DATABASE_URL or DB_CONNECTION environment variable is required for PostgreSQL';
    console.error('[DB] ERROR:', error);
    throw new Error(error);
  }
  
  const sslEnabled = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
  console.log('[DB] PostgreSQL connection:', connectionString.replace(/:[^@]*@/, ':***@'));
  console.log('[DB] SSL enabled:', sslEnabled);
  
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
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 15000,  // Increased for Render's network
  },
  acquireConnectionTimeout: 30000,  // Increased for Render
  useNullAsDefault: true,
};

const db = Knex(config);

// Test connection on startup for production
if (process.env.NODE_ENV === 'production' && client === 'pg') {
  console.log('[DB] Testing connection on startup...');
  db.raw('SELECT 1')
    .then(() => {
      console.log('[DB] ✓ Connection test successful');
    })
    .catch((err) => {
      console.error('[DB] ✗ Connection test failed:');
      console.error('[DB]   Error:', err.message || err.code);
      console.error('[DB]   Code:', err.code);
      console.error('[DB]   Attempting to continue with connection pool...');
      // Don't exit immediately - let pool handle it
    });
}

// Log connection details on startup (redact password)
if (process.env.NODE_ENV !== 'test') {
  const logConnection = (process.env.DATABASE_URL || process.env.DB_CONNECTION || '')
    .replace(/:[^@]*@/, ':***@');
  console.log(`[DB] Connected with ${client} client${logConnection ? ': ' + logConnection : ''}`);
}

module.exports = db;
