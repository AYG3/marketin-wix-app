require('dotenv').config();

const path = require('path');

const DB_CLIENT = process.env.DB_CLIENT || 'sqlite3';
const DB_FILENAME = process.env.DB_FILENAME || './data/dev.sqlite';
const DB_CONNECTION = process.env.DB_CONNECTION || '';

module.exports = {
  development: {
    client: DB_CLIENT,
    connection: DB_CLIENT === 'sqlite3' ? { filename: DB_FILENAME } : DB_CONNECTION,
    migrations: { directory: path.join(__dirname, 'migrations') },
    useNullAsDefault: true,
  },
  test: {
    client: DB_CLIENT,
    connection: DB_CLIENT === 'sqlite3' ? { filename: DB_FILENAME } : DB_CONNECTION,
    migrations: { directory: path.join(__dirname, 'migrations') },
    useNullAsDefault: true,
  },
  production: {
    client: DB_CLIENT,
    connection: DB_CLIENT === 'sqlite3' ? { filename: DB_FILENAME } : DB_CONNECTION,
    migrations: { directory: path.join(__dirname, 'migrations') },
    useNullAsDefault: true,
  }
};
