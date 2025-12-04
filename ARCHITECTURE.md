# Architecture & Deployment Flow Diagram

## Current Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Render Platform                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            Node.js Web Service                           │   │
│  │  (marketin-wix-production)                              │   │
│  │                                                           │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │ Express App (src/app.js)                           │  │   │
│  │  │  ├─ GET /              → {"message":"OK"}          │  │   │
│  │  │  ├─ GET /health        → DB check + metrics        │  │   │
│  │  │  ├─ GET /auth/install  → OAuth redirect            │  │   │
│  │  │  ├─ GET /auth/callback → OAuth handler             │  │   │
│  │  │  ├─ POST /wix/*        → Webhooks                  │  │   │
│  │  │  └─ ...                → Other routes              │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                      ▲                                      │   │
│  │                      │ Verify connection at startup        │   │
│  │                      ▼                                      │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │ Database Connection (src/db/knex.js)              │  │   │
│  │  │                                                     │  │   │
│  │  │  Auto-detection:                                   │  │   │
│  │  │  1. Check DB_CLIENT env var                        │  │   │
│  │  │  2. If not set, check DATABASE_URL exists          │  │   │
│  │  │  3. Use PostgreSQL if DATABASE_URL present         │  │   │
│  │  │  4. Fall back to SQLite                            │  │   │
│  │  │                                                     │  │   │
│  │  │  Connection Pool:                                  │  │   │
│  │  │  • Min connections: 2                              │  │   │
│  │  │  • Max connections: 10                             │  │   │
│  │  │  • Idle timeout: 30s                               │  │   │
│  │  │  • Connection timeout: 5s                          │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                      │                                     │   │
│  │                      ▼                                     │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │ Migrations (knexfile.js)                           │  │   │
│  │  │                                                     │  │   │
│  │  │ Build phase:                                       │  │   │
│  │  │ npm install && npm run migrate:production          │  │   │
│  │  │                                                     │  │   │
│  │  │ Tables created:                                    │  │   │
│  │  │ • wix_tokens                                       │  │   │
│  │  │ • order_webhooks                                   │  │   │
│  │  │ • product_mappings                                 │  │   │
│  │  │ • visitor_sessions                                 │  │   │
│  │  │ • conversion_queue                                 │  │   │
│  │  │ • conversion_failures                              │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘  │   │
│                      │                                          │   │
│                      │ PostgreSQL connection                    │   │
│                      ▼                                          │   │
│  ┌──────────────────────────────────────────────────────────┐  │   │
│  │        PostgreSQL Database                              │  │   │
│  │  (marketin-wix-db-production)                           │  │   │
│  │                                                          │  │   │
│  │  Connection: postgresql://user:pass@host:port/db        │  │   │
│  │  SSL: Enabled                                           │  │   │
│  │  Region: Frankfurt                                      │  │   │
│  └──────────────────────────────────────────────────────────┘  │   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Deployment Flow

```
┌──────────────┐
│ git push     │
│   main       │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Render Webhook Triggered            │
│ (GitHub integration)                │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Clone Repository                    │
│ Load render.yaml config             │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Set Environment Variables           │
│                                     │
│ - NODE_ENV=production              │
│ - DB_CLIENT=pg                     │
│ - DATABASE_URL (from database)     │
│ - WIX_CLIENT_ID, SECRET            │
│ - ENCRYPTION_KEY, SESSION_SECRET   │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Build Phase                         │
│ $ npm install                       │
│ $ npm run migrate:production        │
│                                     │
│ ✓ Install dependencies              │
│ ✓ Create/update database tables    │
│ ✓ If migration fails → deploy fails │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Start Service                       │
│ $ npm start                         │
│                                     │
│ src/server.js:                      │
│ 1. Test DB connection               │
│ 2. If success → start Express app   │
│ 3. If fail → exit with error        │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Health Check Probe                  │
│ GET /health every 10 seconds        │
│                                     │
│ Response (HTTP 200):                │
│ {                                   │
│   "status": "healthy",              │
│   "timestamp": "...",               │
│   "environment": "production",      │
│   "uptime": 123.456                 │
│ }                                   │
│                                     │
│ or (HTTP 503):                      │
│ {                                   │
│   "status": "unhealthy",            │
│   "error": "detailed error msg"     │
│ }                                   │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Service Healthy = Live              │
│ Service Unhealthy = Investigate     │
└─────────────────────────────────────┘
```

## Environment Variable Flow

```
┌─────────────────────────────────────────────────────────┐
│           Render Environment Variables                  │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
┌─────────────────┐   ┌─────────────────────┐
│  Auto-Sync      │   │  Manual (sync:false)│
│  From .env      │   │  Set in Dashboard   │
│                 │   │                     │
│ • ENCRYPTION_KEY│   │ • WIX_CLIENT_ID    │
│ • SESSION_SEC   │   │ • WIX_CLIENT_SECRET│
│ • ADMIN_API_KEY │   │ • WIX_REDIRECT_URI │
│ • PORT = 3000   │   │ • WIX_PUBLIC_KEY   │
│ • NODE_ENV      │   │ • MARKETIN_API_KEY │
│                 │   │ • DATABASE_URL*    │
└────────┬────────┘   └──────────┬──────────┘
         │                       │
         └───────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ Application (src/app.js)   │
        │ knexfile.js                │
        │ src/db/knex.js             │
        │ src/server.js              │
        └────────────────────────────┘

* DATABASE_URL is set by Render from connected database
  Override if needed by setting manually
```

## Data Flow

```
┌──────────────────┐
│  External Client │
│  (Browser/API)   │
└────────┬─────────┘
         │
         ▼
┌────────────────────────────┐
│  Express Middleware        │
│ • body-parser             │
│ • cors                    │
│ • morgan (logging)        │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│  Routes                    │
│ • /auth/*   (OAuth)       │
│ • /wix/*    (Webhooks)    │
│ • /track/*  (Tracking)    │
│ • /admin/*  (Admin)       │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│  Controllers               │
│ • wixOAuth.controller     │
│ • orderWebhook.controller │
│ • inject.controller       │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│  Services                  │
│ • wixApi.service          │
│ • inject.service          │
│ • marketin.service        │
│ • conversionQueue.service │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│  Database (Knex)          │
│ • Query builder           │
│ • Connection pooling      │
│ • Transaction management  │
└────────┬───────────────────┘
         │
         ▼
┌────────────────────────────┐
│  PostgreSQL                │
│ (or SQLite in dev)         │
└────────────────────────────┘
```

## Health Check Decision Tree

```
GET /health request
        │
        ▼
   Try: db.raw('SELECT 1')
        │
        ├─ Success
        │    │
        │    ▼
        │  Return 200 OK
        │  {
        │    "status": "healthy",
        │    ...
        │  }
        │
        └─ Failure
             │
             ├─ Log error
             │
             ├─ Is Development?
             │    YES → Include full error details
             │    NO  → Include message only
             │
             ▼
          Return 503 Service Unavailable
          {
            "status": "unhealthy",
            "error": "Connection refused at ...",
            "details": "..." (dev only)
          }
```

## Key Improvements

```
BEFORE                          →    AFTER
─────────────────────────────────────────────────────
Empty error messages      →    Detailed error messages
Default to SQLite         →    Auto-detect PostgreSQL
Silent DB failures        →    Fail fast with errors
Unknown status            →    Clear health status
Connection pool issues    →    Proper timeout config
No diagnostics            →    Diagnostic script
No documentation          →    Complete guides
```

This architecture ensures:
✅ Reliable database connections
✅ Clear error messages for debugging
✅ Proper health monitoring
✅ Automatic database client detection
✅ Optimized connection pooling
✅ Fail-fast deployment validation
