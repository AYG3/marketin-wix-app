#!/usr/bin/env node

/**
 * Database Connection Diagnostic Script
 * Run this locally or on Render to diagnose DB connection issues
 * Usage: node scripts/test-db-connection.js
 */

require('dotenv').config();
const Knex = require('knex');
const fs = require('fs');
const path = require('path');

async function testConnection() {
  console.log('\n====== DATABASE CONNECTION DIAGNOSTIC ======\n');

  // Show environment
  console.log('Environment Variables:');
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  DB_CLIENT: ${process.env.DB_CLIENT || 'sqlite3'}`);
  
  const dbUrl = process.env.DATABASE_URL || process.env.DB_CONNECTION || '';
  if (dbUrl) {
    console.log(`  DATABASE_URL: ${dbUrl.replace(/:[^@]*@/, ':***@')}`);
  } else {
    console.log(`  DATABASE_URL: (not set)`);
  }

  const client = process.env.DB_CLIENT || (process.env.DATABASE_URL ? 'pg' : 'sqlite3');
  
  console.log(`\nUsing client: ${client}\n`);

  // Build connection config
  let connection;
  if (client === 'sqlite3') {
    const filename = process.env.DB_FILENAME || './data/dev.sqlite';
    connection = { filename };
    console.log(`SQLite file: ${filename}`);
  } else {
    const connectionString = process.env.DATABASE_URL || process.env.DB_CONNECTION || '';
    if (!connectionString) {
      console.error('❌ ERROR: No DATABASE_URL or DB_CONNECTION set for PostgreSQL');
      process.exit(1);
    }
    connection = {
      connectionString,
      ssl: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
        ? { rejectUnauthorized: false }
        : false
    };
    console.log(`PostgreSQL URL: ${connectionString.replace(/:[^@]*@/, ':***@')}`);
    console.log(`SSL: ${connection.ssl ? 'enabled' : 'disabled'}`);
  }

  const config = {
    client,
    connection,
    pool: {
      min: 1,
      max: 1,
    },
    useNullAsDefault: true,
  };

  try {
    const db = Knex(config);
    
    console.log('\n✓ Knex instance created');
    console.log('Testing connection...\n');

    // Test raw query
    const result = await db.raw('SELECT 1 as test');
    console.log('✓ SELECT 1 query successful');
    console.log(`  Result: ${JSON.stringify(result.rows || result)}\n`);

    // Test table listing
    if (client === 'pg') {
      const tables = await db.raw(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      console.log(`✓ Found ${tables.rows.length} tables:`);
      tables.rows.forEach(t => console.log(`  - ${t.table_name}`));
    } else {
      const tables = await db.raw(`
        SELECT name FROM sqlite_master WHERE type='table'
      `);
      console.log(`✓ Found ${tables.length} tables:`);
      tables.forEach(t => console.log(`  - ${t.name}`));
    }

    console.log('\n✅ DATABASE CONNECTION SUCCESSFUL!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ CONNECTION FAILED:\n');
    console.error(`  Error: ${err.message}`);
    console.error(`  Code: ${err.code}`);
    
    if (err.message.includes('ECONNREFUSED')) {
      console.error('\n  → Cannot connect to database server');
      console.error('  → Check if the database is running and accessible');
    } else if (err.message.includes('connect ETIMEDOUT')) {
      console.error('\n  → Connection timeout');
      console.error('  → Check network connectivity and firewall rules');
    } else if (err.message.includes('permission denied')) {
      console.error('\n  → Permission denied');
      console.error('  → Check database user credentials');
    } else if (err.message.includes('does not exist')) {
      console.error('\n  → Database does not exist');
      console.error('  → Ensure database is created and migrations have run');
    }
    
    console.error(`\nFull error: ${err.toString()}\n`);
    process.exit(1);
  }
}

testConnection();
