const app = require('./app');
const PORT = process.env.PORT || 3000;

// Log environment info for debugging
console.log('[ENV] NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('[ENV] DB_CLIENT:', process.env.DB_CLIENT || 'not set (will auto-detect)');
console.log('[ENV] DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');

if (process.env.DATABASE_URL) {
  // Show the full URL but redact the password
  const redactedUrl = process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@');
  console.log('[ENV] DATABASE_URL value:', redactedUrl);
}

// Initialize database
console.log('[DB] Loading database module...');
const db = require('./db');

// Start server with connection test
async function startServer() {
  try {
    // Test database connection with retry
    let connected = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await db.raw('SELECT 1');
        console.log('[DB] ✓ Database connection successful');
        connected = true;
        break;
      } catch (err) {
        console.warn(`[DB] Connection attempt ${attempt}/5 failed:`, err.code || err.message);
        if (attempt < 5) {
          await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds before retry
        }
      }
    }

    if (!connected) {
      console.error('[DB] ✗ Could not connect to database after 5 attempts');
      console.error('[DB] Starting server anyway - health check will show DB status');
    }

    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[SERVER] ✓ Server running on PORT ${PORT}`);
    });
  } catch (err) {
    console.error('[FATAL] Server startup error:', err);
    process.exit(1);
  }
}

startServer();
