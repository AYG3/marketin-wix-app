const app = require('./app');
const PORT = process.env.PORT || 3000;

// Log environment info for debugging
console.log('[ENV] NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('[ENV] DB_CLIENT:', process.env.DB_CLIENT || 'not set (will auto-detect)');
console.log('[ENV] DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');

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
