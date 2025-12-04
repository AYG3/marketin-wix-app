const app = require('./app');
const PORT = process.env.PORT || 3000;

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
    console.error('[DB] Database connection failed on startup:', err.message);
    console.error('[DB] This is critical - migrations may have failed or DATABASE_URL is invalid');
    process.exit(1);
  });
