require('dotenv').config();

const path = require('path');

// Database configuration
// Priority: DB_CLIENT env var > auto-detect from DATABASE_URL > SQLite default
let DB_CLIENT = process.env.DB_CLIENT;
if (!DB_CLIENT) {
  DB_CLIENT = process.env.DATABASE_URL ? 'pg' : 'sqlite3';
}
const DB_FILENAME = process.env.DB_FILENAME || './data/dev.sqlite';
const DB_CONNECTION = process.env.DATABASE_URL || process.env.DB_CONNECTION || '';

console.log('[Knexfile] DB_CLIENT:', DB_CLIENT);
console.log('[Knexfile] DATABASE_URL:', DB_CONNECTION ? 'present' : 'missing');
console.log('[Knexfile] NODE_ENV:', process.env.NODE_ENV || 'development');

// Build connection config based on client type
const getConnection = (client) => {
  if (client === 'sqlite3') {
    return { filename: DB_FILENAME };
  }
  // PostgreSQL - use connection string
  const sslEnabled = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
  console.log('[Knexfile] SSL enabled:', sslEnabled);
  return {
    connectionString: DB_CONNECTION,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false
  };
};

module.exports = {
  development: {
    client: DB_CLIENT,
    connection: getConnection(DB_CLIENT),
    migrations: { directory: path.join(__dirname, 'migrations') },
    useNullAsDefault: true,
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10)
    }
  },
  test: {
    client: 'sqlite3',
    connection: { filename: './data/test.sqlite' },
    migrations: { directory: path.join(__dirname, 'migrations') },
    useNullAsDefault: true,
  },
  staging: {
    client: 'pg',
    connection: getConnection('pg'),
    migrations: { directory: path.join(__dirname, 'migrations') },
    useNullAsDefault: true,
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10)
    }
  },
  production: {
    client: 'pg',
    connection: getConnection('pg'),
    migrations: { directory: path.join(__dirname, 'migrations') },
    useNullAsDefault: true,
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10)
    }
  }
};
