#!/usr/bin/env node

/**
 * Test PostgreSQL connection with detailed diagnostics
 * Usage: node test-pg-connection.js
 */

const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://marketin_wix_db_user:4zPt4FxxbDaN9DR95yUavm8qvfF0L4Et@dpg-d4oj2ua4d50c738u3li0-a.oregon-postgres.render.com/marketin_wix_db';

console.log('[TEST] PostgreSQL Direct Connection Test');
console.log('[TEST] Connection string:', connectionString.replace(/:[^:@]+@/, ':***@'));

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

client.on('error', (err) => {
  console.error('[ERROR] Client error:', err.message);
});

client.connect((err) => {
  if (err) {
    console.error('[CONNECT] Failed to connect!');
    console.error('[CONNECT] Error:', err.message);
    console.error('[CONNECT] Code:', err.code);
    process.exit(1);
  }
  
  console.log('[CONNECT] ✓ Connected successfully!');
  
  client.query('SELECT NOW()', (err, result) => {
    if (err) {
      console.error('[QUERY] Failed to query!');
      console.error('[QUERY] Error:', err.message);
      client.end();
      process.exit(1);
    }
    
    console.log('[QUERY] ✓ Query successful!');
    console.log('[QUERY] Result:', result.rows[0]);
    
    client.end();
    process.exit(0);
  });
});
