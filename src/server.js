const app = require('./app');
const PORT = process.env.PORT || 3000;
const dns = require('dns').promises;

// Log environment info for debugging
console.log('[ENV] NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('[ENV] DB_CLIENT:', process.env.DB_CLIENT || 'not set (will auto-detect)');
console.log('[ENV] DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');

async function checkDatabaseConnection() {
  if (process.env.DATABASE_URL) {
    // Show the full URL but redact the password
    const redactedUrl = process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@');
    console.log('[ENV] DATABASE_URL value:', redactedUrl);
    
    // Parse and show connection details
    try {
      const url = new URL(process.env.DATABASE_URL);
      console.log('[ENV] DB Host:', url.hostname);
      console.log('[ENV] DB Port:', url.port || '5432 (default)');
      console.log('[ENV] DB User:', url.username);
      console.log('[ENV] DB Name:', url.pathname.slice(1));
      
      // Test DNS resolution
      console.log('[DNS] Testing DNS resolution for:', url.hostname);
      try {
        const addresses = await dns.resolve4(url.hostname);
        console.log('[DNS] ✓ DNS resolved to:', addresses.join(', '));
      } catch (dnsErr) {
        console.error('[DNS] ✗ DNS resolution failed:', dnsErr.message);
        console.error('[DNS] This means the hostname cannot be found!');
      }
    } catch (e) {
      console.log('[ENV] Could not parse DATABASE_URL:', e.message);
    }
  }
}

// Run DNS check before loading database
checkDatabaseConnection().then(() => {
  console.log('[DB] Loading database module...');
  // Initialize database before starting server
  const db = require('./db');

  db.raw('SELECT 1')
    .then(() => {
      console.log('[DB] Database connection successful');
      app.listen(PORT, () => {
        console.log(`Server running on PORT ${PORT}`);
      });
    })
    .catch(err => {
      console.error('[DB] Database connection failed on startup!');
      console.error('[DB] Error message:', err.message || '(empty)');
      console.error('[DB] Error code:', err.code || '(none)');
      console.error('[DB] Error name:', err.name || '(none)');
      if (err.stack) {
        console.error('[DB] Stack trace:', err.stack.split('\n').slice(0, 3).join('\n'));
      }
      console.error('[DB] Full error object:', JSON.stringify(err, null, 2));
      console.error('[DB] This is critical - migrations may have failed or DATABASE_URL is invalid');
      process.exit(1);
    });
}).catch(err => {
  console.error('[FATAL] Error during startup:', err);
  process.exit(1);
});
