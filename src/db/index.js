const Knex = require('knex');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const client = process.env.DB_CLIENT || 'sqlite3';
const connection = client === 'sqlite3' ? { filename: process.env.DB_FILENAME || './data/dev.sqlite' } : (process.env.DB_CONNECTION || '');

if (client === 'sqlite3') {
  const filename = (connection && connection.filename) || './data/dev.sqlite';
  const dir = path.dirname(filename);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error('Could not create sqlite data dir', err);
  }
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
