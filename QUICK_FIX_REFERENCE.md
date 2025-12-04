# Quick Fix Reference - Market!N Wix App Deployment Issues

## Issue: Health Endpoint Returns 503 (Unhealthy)

### What Was Wrong
The app couldn't connect to PostgreSQL because:
1. No explicit `DB_CLIENT=pg` setting
2. App defaulted to SQLite even with DATABASE_URL present
3. Empty error messages made debugging impossible

### What Was Fixed
✅ **Auto-detection implemented** - if DATABASE_URL exists → use PostgreSQL
✅ **Error messages now visible** - health endpoint shows actual errors
✅ **Connection verification** - server won't start if DB unavailable
✅ **Connection pooling optimized** - proper timeouts configured

---

## What You Need to Do

### 1. Push the Changes
```bash
cd /Users/ayg3/code/marketin_all/marketin-wix-app
git add -A
git commit -m "fix: database connection issues and health check"
git push origin main
```

### 2. Verify Render Environment Variables
**Go to Render Dashboard → Your Service → Environment**

Confirm these are set:
- `NODE_ENV` = `production`
- `DB_CLIENT` = `pg` ← Make sure this is set!
- `DATABASE_URL` = `postgresql://...` (connected database)
- `WIX_CLIENT_ID` ✓
- `WIX_CLIENT_SECRET` ✓
- `WIX_REDIRECT_URI` ✓

### 3. Deploy
Render auto-deploys when you push to `main`, OR manually redeploy:
- Render Dashboard → Service → Manual Deploy

### 4. Test
```bash
curl https://marketin-wix-app.onrender.com/health
```

Expected: `{"status":"healthy",...}`

---

## If Still Getting 503

### Quick Diagnostic
```bash
# Test locally with Render database URL
NODE_ENV=production \
DB_CLIENT=pg \
DATABASE_URL="<your-db-url>" \
node scripts/test-db-connection.js
```

This will show the exact error preventing connection.

### Common Issues & Fixes

| Error | Fix |
|-------|-----|
| `ENOTFOUND` | Database hostname wrong - check DATABASE_URL |
| `permission denied` | Wrong credentials - verify DB user/password |
| `does not exist` | Database not created or migrations failed |
| `connect ETIMEDOUT` | Network blocked - check firewall rules |
| `SSL certificate` | Already handled - should work on Render |

---

## Files Changed

| File | Change | Impact |
|------|--------|--------|
| `src/app.js` | Health check error details | Shows actual errors in `/health` |
| `src/db/knex.js` | Auto-detect DB client | Automatically uses PostgreSQL with DATABASE_URL |
| `src/server.js` | DB verification on startup | Fails fast if database unavailable |
| `knexfile.js` | Auto-detect DB client | Consistent behavior for migrations |
| `scripts/test-db-connection.js` | NEW diagnostic tool | Helps diagnose DB issues |
| `DEPLOYMENT_CHECKLIST.md` | NEW reference guide | Complete deployment instructions |

---

## OAuth Configuration ✓
Already correct - no changes needed:
- Callback URL: `https://marketin-wix-app.onrender.com/auth/callback`
- All environment variables properly configured
- Wix Developer Center integration verified

---

## Migrations ✓
Already running automatically:
- Build command: `npm install && npm run migrate:production`
- Runs before server starts
- Uses `production` knex config with DATABASE_URL

---

## Bottom Line

The application needed better database connection handling. All fixes are in place. After you verify the Render environment variables (especially `DB_CLIENT=pg`), everything should work.

**Next action:** Push changes and check `/health` endpoint on Render.
