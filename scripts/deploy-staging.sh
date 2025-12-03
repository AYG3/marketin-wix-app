#!/bin/bash
# ============================================================
# Deploy to Staging - Market!N Wix Integration
# ============================================================
# Triggers a deploy on Render staging environment
#
# Usage:
#   ./scripts/deploy-staging.sh
#
# Requirements:
#   - RENDER_DEPLOY_HOOK_STAGING environment variable set
#   - Or pass the hook URL as an argument
#
# Get your deploy hook from:
#   Render Dashboard → Your Service → Settings → Deploy Hook
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "🚀 Market!N Wix Integration - Deploy to Staging"
echo "================================================"
echo ""

# Get deploy hook URL from env or argument
DEPLOY_HOOK="${RENDER_DEPLOY_HOOK_STAGING:-$1}"

if [ -z "$DEPLOY_HOOK" ]; then
    echo -e "${RED}❌ Error: No deploy hook URL provided${NC}"
    echo ""
    echo "Set the RENDER_DEPLOY_HOOK_STAGING environment variable:"
    echo "  export RENDER_DEPLOY_HOOK_STAGING=https://api.render.com/deploy/srv-xxx?key=yyy"
    echo ""
    echo "Or pass it as an argument:"
    echo "  ./scripts/deploy-staging.sh https://api.render.com/deploy/srv-xxx?key=yyy"
    echo ""
    exit 1
fi

echo -e "${YELLOW}📡 Triggering Render deploy...${NC}"
echo ""

# Make the deploy request
HTTP_CODE=$(curl -s -o /tmp/render-deploy-response.txt -w "%{http_code}" -X POST "$DEPLOY_HOOK")

# Read response body
RESPONSE_BODY=$(cat /tmp/render-deploy-response.txt 2>/dev/null || echo "")

# Check response
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "202" ]; then
    echo -e "${GREEN}✅ Deploy triggered successfully!${NC}"
    echo ""
    echo "HTTP Status: $HTTP_CODE"
    if [ -n "$RESPONSE_BODY" ]; then
        echo "Response: $RESPONSE_BODY"
    fi
    echo ""
    echo "📋 Next steps:"
    echo "   1. Check Render dashboard for deploy progress"
    echo "   2. Monitor logs at: https://dashboard.render.com"
    echo "   3. Test staging URL after deploy completes"
    echo ""
else
    echo -e "${RED}❌ Deploy failed!${NC}"
    echo ""
    echo "HTTP Status: $HTTP_CODE"
    if [ -n "$RESPONSE_BODY" ]; then
        echo "Response: $RESPONSE_BODY"
    fi
    echo ""
    echo "Common issues:"
    echo "   - Invalid deploy hook URL"
    echo "   - Service not found or deleted"
    echo "   - Render API issues"
    echo ""
    exit 1
fi

# Cleanup
rm -f /tmp/render-deploy-response.txt
