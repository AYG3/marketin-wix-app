# Deployment Checklist for Market!N Wix App

## Pre-Deployment Checks ✓

### 1. Local Environment Setup
- [ ] Node.js v14+ installed
- [ ] npm dependencies installed: `npm install`
- [ ] `.env` file created from `.env.example`
- [ ] All required environment variables set

### 2. Database Configuration

#### For Development (SQLite)
- [ ] `DB_CLIENT` not set (defaults to sqlite3) OR explicitly set to `sqlite3`
- [ ] `./data/` directory exists or will be created automatically
- [ ] Migrations work locally: `npm run migrate`

#### For Production/Staging (PostgreSQL)
- [ ] `DATABASE_URL` environment variable is set
- [ ] `DB_CLIENT=pg` is set (or relies on auto-detection from DATABASE_URL)
- [ ] Format: `postgresql://user:password@host:port/dbname`
- [ ] Database is created and accessible
- [ ] Migrations run successfully

### 3. OAuth Configuration
- [ ] `WIX_CLIENT_ID` is set
- [ ] `WIX_CLIENT_SECRET` is set  
- [ ] `WIX_REDIRECT_URI` is set to your deployment URL: `https://your-domain.com/auth/callback`
- [ ] `WIX_PUBLIC_KEY` is set
- [ ] OAuth redirect URI matches exactly in Wix Developer Center

### 4. API Keys & Secrets
- [ ] `MARKETIN_API_KEY` is set
- [ ] `MARKETIN_API_URL` is set (production: `https://api.marketin.now/api/v1`)
- [ ] `ENCRYPTION_KEY` is set (strong random value)
- [ ] `SESSION_SECRET` is set (strong random value)
- [ ] `ADMIN_API_KEY` is set (for admin endpoints)

---

## Render Deployment Setup ✓

### 1. Blueprint Configuration
- [ ] `render.yaml` is in repository root
- [ ] Staging service branch set to `develop`
- [ ] Production service branch set to `main`
- [ ] `healthCheckPath: /health` is configured
- [ ] `buildCommand: npm install && npm run migrate:production` is set
- [ ] `startCommand: npm start` is set

### 2. Environment Variables in Render Dashboard
**For both Staging and Production:**
- [ ] `NODE_ENV` = `staging` (staging) or `production` (prod)
- [ ] `PORT` = `3000`
- [ ] `DB_CLIENT` = `pg` (**IMPORTANT** - ensures PostgreSQL is used)
- [ ] `DATABASE_URL` = set from connected PostgreSQL database
- [ ] `WIX_CLIENT_ID` = manually entered (sync: false)
- [ ] `WIX_CLIENT_SECRET` = manually entered (sync: false)
- [ ] `WIX_REDIRECT_URI` = manually entered (sync: false)
- [ ] `WIX_PUBLIC_KEY` = manually entered (sync: false)
- [ ] `MARKETIN_API_KEY` = manually entered (sync: false)
- [ ] `ENCRYPTION_KEY` = generated value
- [ ] `SESSION_SECRET` = generated value
- [ ] `ADMIN_API_KEY` = generated value

### 3. Database Setup
- [ ] PostgreSQL database created in Render
- [ ] Database user created with proper permissions
- [ ] Connection string verified
- [ ] SSL enabled (production)

### 4. Post-Deploy Verification
Run these checks after deployment:

```bash
# Test health endpoint
curl https://your-domain.com/health

# Should return:
# {
#   "status": "healthy",
#   "timestamp": "2025-12-04T14:53:43.124Z",
#   "version": "1.0.0",
#   "environment": "production",
#   "uptime": 123.456
# }

# If unhealthy, check:
# - Database connection (migrations may have failed)
# - Check Render logs for errors
```

---

## Troubleshooting Guide 🔧

### Health Check Returns "Unhealthy"

**Problem:** `/health` endpoint returns 503 with error
```json
{
  "status": "unhealthy",
  "error": "error message here"
}
```

**Solutions:**

1. **Check Database Connection**
   ```bash
   # Verify DATABASE_URL in Render dashboard
   # Format: postgresql://user:password@host:port/dbname
   
   # Check if DB_CLIENT is set to 'pg'
   # Without this, the app will default to SQLite!
   ```

2. **Check Migrations**
   ```bash
   # In Render deploy logs, look for migration errors
   # The buildCommand runs: npm run migrate:production
   
   # If migrations fail, app cannot start
   ```

3. **Database Accessibility**
   - Verify the database host is reachable
   - Check firewall rules allow Render to access DB
   - Verify database user permissions

4. **Connection Pool Issues**
   - Check if max connections exceeded
   - Look for timeout errors in logs

### OAuth Redirect Not Working

**Problem:** OAuth callback fails or redirects to wrong URL

**Solutions:**
1. Verify `WIX_REDIRECT_URI` = `https://your-domain.com/auth/callback`
2. Ensure exact match in Wix Developer Center
3. Check that your domain is correct in Render

### Migrations Not Running

**Problem:** Tables don't exist after deployment

**Solutions:**
1. Check build command in render.yaml:
   ```yaml
   buildCommand: npm install && npm run migrate:production
   ```
2. Check Render deploy logs for errors
3. Verify `DATABASE_URL` is set before build starts
4. Try running manually:
   ```bash
   npm run migrate:production
   ```

### Database Connection Timeout

**Problem:** `Error: getaddrinfo ENOTFOUND` or `ETIMEDOUT`

**Solutions:**
1. Verify DATABASE_URL hostname is correct
2. Check if database is running
3. Verify network connectivity (Render→Database)
4. Check for firewall rules blocking connection

---

## Health Check Diagnostic Script

Use this script to test database connection locally:

```bash
NODE_ENV=production \
DB_CLIENT=pg \
DATABASE_URL="your-connection-string" \
node scripts/test-db-connection.js
```

This will:
- ✓ Verify database connection
- ✓ List all tables
- ✓ Show detailed error messages if connection fails

---

## Key Configuration Notes

### Auto-Detection of Database Client
The application uses auto-detection for the database client:

```
1. If DB_CLIENT env var is set → use that
2. Else if DATABASE_URL is set → auto-detect as 'pg' (PostgreSQL)
3. Else → use 'sqlite3' (SQLite)
```

**Important for Render:** Explicitly set `DB_CLIENT=pg` in Render dashboard to avoid auto-detection issues.

### SSL Configuration
- **Development:** SSL disabled
- **Staging/Production:** SSL enabled with `rejectUnauthorized: false`

This is necessary for Render's managed PostgreSQL databases.

### Health Check
- Endpoint: `GET /health`
- Frequency: Render checks every 10 seconds
- Timeout: 5 seconds
- Success: Returns 200 with `"status": "healthy"`
- Failure: Returns 503 with error details

---

## Deployment Commands

```bash
# Staging deployment
./scripts/deploy-staging.sh

# Production deployment
./scripts/deploy-production.sh

# Manual deployment via Render dashboard:
# 1. Connect your GitHub repo to Render
# 2. Select "Blueprint" deployment
# 3. Render reads render.yaml and deploys

# Check logs on Render
# Dashboard → Select Service → Logs tab
```

---

## Monitoring & Alerts

### Essential Metrics to Monitor
- [ ] Health check status (should be "healthy")
- [ ] Response times (should be < 500ms)
- [ ] Error rates (should be < 1%)
- [ ] Database connection pool usage
- [ ] Memory usage
- [ ] CPU usage

### Alert Triggers
Set up alerts for:
- [ ] Health check fails 2 times in a row
- [ ] Error rate > 5%
- [ ] Response time > 2 seconds
- [ ] Service crashes

---

## Rollback Procedure

If deployment fails:

1. **Check Render Logs**
   - Go to Render dashboard
   - Select your service
   - Check "Logs" tab for errors

2. **Rollback to Previous Version**
   - Render → Service → Deployments tab
   - Find last successful deployment
   - Click "Redeploy"

3. **Emergency Fixes**
   - Update environment variables
   - Trigger new deployment from Render dashboard
   - Or push new commit to trigger auto-deploy

---

## Contact & Support

For issues or questions:
1. Check this checklist first
2. Review troubleshooting guide
3. Check Render logs for detailed errors
4. Test database connection with diagnostic script
