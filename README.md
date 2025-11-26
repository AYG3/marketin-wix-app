# marketin-wix-app (scaffold)

This project is a minimal Node.js/Express backend scaffold for integrating market!n with Wix shops.

Quick start

1. Copy `.env.example` to `.env` and fill keys

2. Install dependencies

```bash
npm install
```

3. Run the server

```bash
npm start
# or use nodemon
npm run dev
```

Endpoints

- GET / -> health check
- GET /auth/install -> redirect to Wix OAuth (requires WIX_CLIENT_ID and WIX_REDIRECT_URI)
- GET /auth/callback -> handles OAuth callback and stores tokens in DB (mocked behavior)
- POST /webhooks/order -> accepts order webhooks and persists payload

Database: SQLite (Knex)

The scaffold uses Knex with SQLite by default. Configure the database in `.env` using `DB_CLIENT` and `DB_FILENAME`.

To switch to Postgres, set `DB_CLIENT=pg` and provide `DB_CONNECTION` environment variable (e.g. `postgres://user:pass@host:5432/db`).

Token encryption

- You should set `ENCRYPTION_KEY` in `.env` to a unique secret used to encrypt tokens at rest. If not set, tokens will be stored in plaintext (not recommended).

Migrations

- This scaffold uses Knex migrations for DB schema. Run migrations with:

```bash
npm run migrate
# or run migrations for test environment
npm run migrate:test
```

To rollback migrations in development, run:

```bash
npm run migrate:rollback
```
