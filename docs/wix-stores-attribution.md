# Wix Stores Affiliate Attribution Integration

This document explains how to capture affiliate attribution data and attach it to Wix Store orders so that conversions are properly attributed.

## Overview

The Market!N tracking pixel automatically:
1. Captures URL parameters (`aid`, `cid`, `pid`, `utm_*`) when visitors land on your site
2. Stores them in cookies with 100-day expiry
3. Sends session data to the tracking endpoint

For orders to be attributed, the affiliate data must be included in the order payload that arrives via webhook.

## Parameter Reference

| URL Param | Cookie Name | Description |
|-----------|-------------|-------------|
| `aid`, `adv`, `ref` | `marketin_aid` | Advocate/Affiliate ID |
| `cid`, `campaign_id` | `marketin_cid` | Campaign ID |
| `pid`, `product_id` | `marketin_pid` | Product ID |
| `utm_source` | `marketin_utm_source` | UTM Source |
| `utm_medium` | `marketin_utm_medium` | UTM Medium |
| `utm_campaign` | `marketin_utm_campaign` | UTM Campaign |
| `utm_content` | `marketin_utm_content` | UTM Content |
| `utm_term` | `marketin_utm_term` | UTM Term |

## Integration Methods

### Method 1: Buyer Note (Recommended for Wix Stores)

Wix Stores supports a "Buyer Note" field that customers can fill in during checkout. You can programmatically set this field to include affiliate data.

**Add this code to your Wix site (Velo/Custom Code):**

```javascript
// In your checkout page or before cart submission
import wixStoresBackend from 'wix-stores-backend';

// Get affiliate data from Market!N pixel
function getMarketinData() {
  if (typeof MARKETIN !== 'undefined' && MARKETIN.getAffiliateData) {
    return MARKETIN.getAffiliateData();
  }
  // Fallback: read cookies directly
  const getCookie = (name) => {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  };
  return {
    aid: getCookie('marketin_aid'),
    cid: getCookie('marketin_cid'),
    pid: getCookie('marketin_pid'),
    sessionId: getCookie('marketin_session_id')
  };
}

// Call before checkout to set buyer note
export function attachAffiliateToOrder() {
  const data = getMarketinData();
  if (data.aid) {
    // Format: ref=AFF123,cid=CAMP456,sid=SESSION789
    const note = `ref=${data.aid}${data.cid ? ',cid=' + data.cid : ''}${data.sessionId ? ',sid=' + data.sessionId : ''}`;
    // Store in session for checkout
    wixStoresBackend.setCartBuyerNote(note);
  }
}
```

The webhook handler parses `buyerNote` for patterns like `ref=AFF123`.

### Method 2: Custom Fields (Wix Stores Pro)

If you have Wix Stores Pro, you can add custom fields to orders:

```javascript
// In checkout page or order creation
import wixStoresBackend from 'wix-stores-backend';

export async function onBeforeCheckout(event) {
  const data = getMarketinData();
  
  if (data.aid) {
    // Add custom fields to the order
    event.order.customFields = event.order.customFields || [];
    event.order.customFields.push(
      { name: 'affiliateId', value: data.aid },
      { name: 'campaignId', value: data.cid || '' },
      { name: 'sessionId', value: data.sessionId || '' }
    );
  }
  return event;
}
```

### Method 3: Wix Velo Backend (Order Creation Hook)

Use Wix Velo's backend hooks to attach data during order creation:

```javascript
// backend/events.js
import wixData from 'wix-data';

export function wixStores_onOrderCreated(event) {
  const order = event.order;
  
  // Look up session by visitorId from the order
  // Note: This requires the visitor cookie to be sent to your backend somehow
  // One approach: use the email to look up recent sessions
  
  return wixData.query("MarketinSessions")
    .eq("email", order.buyerEmail)
    .descending("createdAt")
    .limit(1)
    .find()
    .then((results) => {
      if (results.items.length > 0) {
        const session = results.items[0];
        // Update order with affiliate data
        return wixStoresBackend.updateOrderInfo(order._id, {
          customFields: [
            { name: 'affiliateId', value: session.affiliateId },
            { name: 'campaignId', value: session.campaignId }
          ]
        });
      }
    });
}
```

### Method 4: Identify on Checkout (Recommended)

Call `MARKETIN.identify()` when the customer enters their email during checkout:

```javascript
// In your checkout page
$w.onReady(function () {
  // When email field is filled
  $w('#emailInput').onChange((event) => {
    const email = event.target.value;
    if (email && typeof MARKETIN !== 'undefined') {
      MARKETIN.identify(email);
    }
  });
});
```

This links the visitor session to their email, allowing the backend to attribute the order when the webhook arrives (by looking up sessions by email).

## Webhook Attribution Flow

When an order webhook arrives, the system attempts to find affiliate attribution in this order:

1. **Direct from Order**: Parses `buyerNote` for `ref=AFF123` pattern
2. **Custom Fields**: Checks `customFields.affiliateId`
3. **Session Lookup**: Uses `visitorId` or `sessionId` to find stored session
4. **Email Lookup**: Matches `buyerEmail` to identified sessions
5. **Recent Site Session**: Falls back to recent sessions on the same site

## Testing Attribution

1. Visit your Wix store with affiliate params:
   ```
   https://your-store.com/?aid=TEST123&cid=CAMP456
   ```

2. Check cookies are set:
   - Open DevTools > Application > Cookies
   - Verify `marketin_aid`, `marketin_cid`, `marketin_session_id` exist

3. Complete a test purchase

4. Check the webhook payload in admin:
   ```bash
   curl -H "x-admin-key: YOUR_KEY" https://your-app.com/admin/webhooks/recent
   ```

5. Verify the order has `affiliateId` in the parsed data

## Troubleshooting

### Affiliate not captured
- Ensure pixel is injected (check page source for `MARKETIN` script)
- Verify cookies are not blocked by browser settings
- Check cookie domain matches your store domain

### Order not attributed
- Verify webhook is received (check `/admin/webhooks/recent`)
- Ensure `buyerNote` or custom fields contain affiliate data
- Check session wasn't expired (default 30 days)

### Cross-domain issues
- If using custom domain, ensure cookies are set on the correct domain
- Consider using first-party cookies only (SameSite=Lax)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/track/session` | POST | Capture visitor session (called by pixel) |
| `/visitor/identify` | POST | Link session to email/identifier |
| `/admin/webhooks/recent` | GET | View recent webhooks (requires admin key) |
