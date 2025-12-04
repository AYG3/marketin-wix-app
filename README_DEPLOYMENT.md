# Market!N Wix Integration - Deployment Guide

This guide covers deploying the Market!N Wix Integration service to Render for both staging and production environments.

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Deploying to Render](#deploying-to-render)
- [Environment Variables](#environment-variables)
- [Wix Developer Center Configuration](#wix-developer-center-configuration)
- [Post-Deployment Verification](#post-deployment-verification)
- [Monitoring & Alerts](#monitoring--alerts)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Clone and install
git clone <your-repo>
cd marketin-wix-app
npm install

# 2. Copy environment template
cp .env.example .env
# Edit .env with your values

# 3. Run migrations
npm run migrate

# 4. Start locally
npm run dev

# 5. Deploy to Render (after setup)
./scripts/deploy-staging.sh
./scripts/deploy-production.sh
```

---

## Prerequisites

Before deploying, ensure you have:

1. **Wix Developer Account** with an app created at [dev.wix.com](https://dev.wix.com)
2. **Render Account** at [render.com](https://render.com)
3. **GitHub Repository** connected to Render for auto-deploy
4. **Market!N API Credentials** from your Market!N dashboard

---

## Environment Setup

### Local Development

```bash
# Copy the example environment file
cp .env.example .env

# Generate encryption keys
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ADMIN_API_KEY=' + require('crypto').randomBytes(24).toString('hex'))"
```

### Staging vs Production

| Setting | Staging | Production |
|---------|---------|------------|
| `NODE_ENV` | `staging` | `production` |
| `APP_URL` | `https://marketin-wix-staging.onrender.com` | `https://marketin-wix.onrender.com` |
| Database | Free tier PostgreSQL | Paid PostgreSQL |
| Auto-deploy | From `develop` branch | From `main` branch |

---

## Deploying to Render

### Option 1: Using Render Blueprint (Recommended)

1. **Connect Repository**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click **New** → **Blueprint**
   - Connect your GitHub repository
   - Render will detect `render.yaml` and create services automatically

2. **Configure Secrets**
   - After blueprint deployment, go to each service
   - Navigate to **Environment** tab
   - Fill in the `sync: false` variables (secrets that weren't auto-generated)

### Option 2: Manual Service Creation

1. **Create Web Service**
   - Go to Render Dashboard → **New** → **Web Service**
   - Connect your GitHub repository
   - Configure:
     - **Name**: `marketin-wix-staging` or `marketin-wix-production`
     - **Region**: Frankfurt (EU) or your preferred region
     - **Branch**: `develop` for staging, `main` for production
     - **Runtime**: Node
     - **Build Command**: `npm install && npm run migrate:production`
     - **Start Command**: `npm start`

2. **Create PostgreSQL Database**
   - Go to Render Dashboard → **New** → **PostgreSQL**
   - Create database for each environment
   - Copy the **Internal Database URL** for `DATABASE_URL`

3. **Configure Environment Variables**
   - Add all required variables (see [Environment Variables](#environment-variables))

### Deploy Scripts

After setting up Render, get your deploy hook URLs:

1. Go to your service in Render Dashboard
2. Navigate to **Settings** → **Deploy Hook**
3. Copy the URL

```bash
# Set environment variables
export RENDER_DEPLOY_HOOK_STAGING="https://api.render.com/deploy/srv-xxx?key=yyy"
export RENDER_DEPLOY_HOOK_PRODUCTION="https://api.render.com/deploy/srv-zzz?key=www"

# Deploy
./scripts/deploy-staging.sh
./scripts/deploy-production.sh
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment name | `production` |
| `PORT` | Server port (Render sets automatically) | `3000` |
| `APP_URL` | Public URL of your app | `https://marketin-wix.onrender.com` |
| `WIX_CLIENT_ID` | Wix app ID from Developer Center | `d43baaf2-38ca-...` |
| `WIX_CLIENT_SECRET` | Wix app secret | `e1c3c0c0-3cde-...` |
| `WIX_REDIRECT_URI` | OAuth callback URL | `https://your-domain.com/auth/callback` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `ENCRYPTION_KEY` | 32-byte hex key for token encryption | `0123456789abcdef...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WIX_PUBLIC_KEY` | RSA public key for webhook verification | - |
| `MARKETIN_API_KEY` | Market!N platform API key | - |
| `MARKETIN_API_URL` | Market!N API endpoint | `https://api.marketin.now/api/v1` |
| `SESSION_SECRET` | Session encryption secret | - |
| `ADMIN_API_KEY` | API key for admin endpoints | - |
| `SMTP_HOST` | SMTP server for alerts | - |
| `ALERT_EMAIL` | Email for error notifications | - |

### Generating Secrets

```bash
# Generate ENCRYPTION_KEY (32 bytes = 64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate ADMIN_API_KEY
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

---

## Wix Developer Center Configuration

After deploying, update your Wix app settings:

### 1. OAuth Settings

Go to **Wix Developers Console** → Your App → **OAuth**

| Setting | Value |
|---------|-------|
| **Redirect URL (Staging)** | `https://marketin-wix-staging.onrender.com/auth/callback` |
| **Redirect URL (Production)** | `https://marketin-wix.onrender.com/auth/callback` |

### 2. Webhook Settings

Go to **Wix Developers Console** → Your App → **Webhooks**

Add these webhook endpoints:

| Webhook | Endpoint |
|---------|----------|
| **eCommerce Orders** | `https://your-domain.com/wix/orders/webhook` |
| **App Installed** | `https://your-domain.com/webhooks/app-installed` |
| **App Uninstalled** | `https://your-domain.com/webhooks/app-uninstalled` |

### 3. Dashboard (Iframe) Settings

Go to **Wix Developers Console** → Your App → **Extensions** → **Dashboard Page**

| Setting | Value |
|---------|-------|
| **Page URL** | `https://your-domain.com/iframe-ui/index.html` |
### Market!N API Keys per Brand

Market!N API keys are now stored per-installation (per Wix site/brand) for better security and isolation. Brand owners can generate keys from the Market!N Dashboard (Integrations → API Keys) and paste them into the Wix App dashboard:

1. Open your Wix site's Market!N dashboard (iframe UI)
2. Go to **Settings** → **Brand Settings**
3. Paste your **Market!N API Key** in the field and click **Save Key**
4. The key is encrypted and stored for this installation only; it will be used for product sync and conversion reporting.

Note: If no per-brand key is set, the app will fall back to a global `MARKETIN_API_KEY` value in environment variables (not recommended for multi-tenant setups).


### 4. Embedded Script Extension

Go to **Wix Developers Console** → Your App → **Extensions** → **Embedded Script**

Configure the Market!N tracking script to be embedded on all pages.

---

## Post-Deployment Verification

### Health Check

```bash
# Check service health
curl https://your-domain.com/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-12-03T12:00:00.000Z",
  "version": "1.0.0",
  "environment": "production",
  "uptime": 3600
}
```

### Smoke Tests

```bash
# 1. Health endpoint
curl -s https://your-domain.com/health | jq .status
# Should return: "healthy"

# 2. OAuth redirect
curl -s -o /dev/null -w "%{http_code}" "https://your-domain.com/auth/install"
# Should return: 302 (redirect to Wix)

# 3. Iframe UI
curl -s -o /dev/null -w "%{http_code}" "https://your-domain.com/iframe-ui/index.html"
# Should return: 200

# 4. Webhook endpoint (will return 401 without valid signature)
curl -s -o /dev/null -w "%{http_code}" -X POST "https://your-domain.com/wix/orders/webhook"
# Should return: 401 (expected without valid Wix signature)
```

### Full Integration Test

1. Install your app on a test Wix site
2. Verify the dashboard iframe loads
3. Configure brandId in settings
4. Make a test purchase
5. Verify webhook is received and conversion is queued

---

## Monitoring & Alerts

### Render Dashboard

Monitor your service at [dashboard.render.com](https://dashboard.render.com):

- **Logs**: Real-time application logs
- **Metrics**: CPU, memory, request latency
- **Events**: Deploy history, restarts

### Recommended Alerts

Set up alerts for:

| Metric | Threshold | Action |
|--------|-----------|--------|
| Health check failures | > 3 consecutive | PagerDuty/Slack alert |
| 5xx error rate | > 5% | Email notification |
| Response latency | p95 > 2000ms | Warning notification |
| Webhook failures | > 10% failure rate | Email + investigate |
| Token refresh failures | Any | Email alert |

### Log Monitoring

Key log patterns to watch:

```bash
# Successful webhook processing
"Conversion enqueued"

# Token refresh
"Token refreshed successfully"

# Errors to alert on
"Token refresh failed"
"Webhook signature validation failed"
"Database connection error"
```

### Email Alerts

Configure SMTP settings for error alerts:

```env
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-username
SMTP_PASS=your-password
ALERT_EMAIL=team@yourcompany.com
```

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Errors

```
Error: Connection refused to database
```

**Solution**: 
- Verify `DATABASE_URL` is set correctly
- Use Render's **Internal Database URL** (not External)
- Check database is running in Render dashboard

#### 2. OAuth Callback Failures

```
Error: redirect_uri_mismatch
```

**Solution**:
- Ensure `WIX_REDIRECT_URI` matches exactly what's in Wix Developer Center
- Include the full URL with protocol (`https://`)
- Check for trailing slashes

#### 3. Webhook Signature Errors

```
Error: Invalid signature
```

**Solution**:
- Verify `WIX_PUBLIC_KEY` is correctly set (base64 encoded)
- Check webhook is coming from Wix (not test requests in production)
- Ensure raw body is captured correctly

#### 4. Health Check Failing on Deploy

```
Error: Health check timeout
```

**Solution**:
- Verify `/health` endpoint is working locally
- Check database migrations ran successfully
- Review deploy logs for startup errors

#### 5. Iframe Not Loading

```
Error: Refused to display in frame
```

**Solution**:
- Verify CORS settings in `src/app.js`
- Check iframe URL is correct in Wix Developer Center
- Ensure HTTPS is being used

### Debug Endpoints (Development Only)

In non-production environments:

```bash
# View configuration
curl https://staging.your-domain.com/debug/config

# Check installations
curl https://staging.your-domain.com/debug/tokens

# View conversion queue
curl https://staging.your-domain.com/debug/conversions
```

### Getting Help

1. Check Render logs: Dashboard → Your Service → Logs
2. Review GitHub Actions: Repository → Actions tab
3. Test locally with ngrok before deploying
4. Contact support with deploy ID and timestamps

---

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) automatically:

1. **On every push**: Runs linter and tests
2. **On push to `develop`**: Deploys to staging
3. **On push to `main`**: Deploys to production

### Setting Up CI/CD

1. Go to GitHub → Repository → Settings → Secrets
2. Add these secrets:
   - `RENDER_DEPLOY_HOOK_STAGING`
   - `RENDER_DEPLOY_HOOK_PRODUCTION`

### Manual Deploys

```bash
# Deploy staging
./scripts/deploy-staging.sh

# Deploy production (with confirmation)
./scripts/deploy-production.sh
```

---

## Security Checklist

Before going to production:

- [ ] All secrets are set in Render (not in code)
- [ ] `ENCRYPTION_KEY` is unique and secure (32 bytes)
- [ ] `NODE_ENV=production` is set
- [ ] Debug routes are disabled (automatic in production)
- [ ] HTTPS is enforced (Render does this automatically)
- [ ] Database is using paid tier (for reliability)
- [ ] Webhook signature verification is enabled
- [ ] Admin endpoints require `ADMIN_API_KEY`
- [ ] Error alerts are configured
- [ ] Logs don't contain sensitive data
