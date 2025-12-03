#!/usr/bin/env node
/**
 * Send Fake Order Script
 * 
 * Posts a sample order webhook payload to test the order processing flow.
 * 
 * Usage:
 *   node scripts/send-fake-order.js [options]
 * 
 * Options:
 *   --url       Base URL (default: http://localhost:3000)
 *   --affiliate Affiliate ID to include in buyer note (default: AFF123)
 *   --campaign  Campaign ID (default: CAMP456)
 *   --amount    Order total (default: 99.99)
 *   --email     Buyer email (default: test@example.com)
 *   --help      Show this help
 * 
 * Examples:
 *   node scripts/send-fake-order.js
 *   node scripts/send-fake-order.js --affiliate AFF789 --amount 149.99
 *   node scripts/send-fake-order.js --url https://your-ngrok-url.ngrok.io
 */

const https = require('https');
const http = require('http');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  url: 'http://localhost:3000',
  affiliate: 'AFF123',
  campaign: 'CAMP456',
  amount: '99.99',
  email: 'test@example.com'
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Send Fake Order Script

Posts a sample order webhook payload to test the order processing flow.

Usage:
  node scripts/send-fake-order.js [options]

Options:
  --url       Base URL (default: http://localhost:3000)
  --affiliate Affiliate ID to include in buyer note (default: AFF123)
  --campaign  Campaign ID (default: CAMP456)
  --amount    Order total (default: 99.99)
  --email     Buyer email (default: test@example.com)
  --help      Show this help

Examples:
  node scripts/send-fake-order.js
  node scripts/send-fake-order.js --affiliate AFF789 --amount 149.99
  node scripts/send-fake-order.js --url https://your-ngrok-url.ngrok.io
`);
    process.exit(0);
  }
  if (args[i] === '--url' && args[i + 1]) options.url = args[++i];
  if (args[i] === '--affiliate' && args[i + 1]) options.affiliate = args[++i];
  if (args[i] === '--campaign' && args[i + 1]) options.campaign = args[++i];
  if (args[i] === '--amount' && args[i + 1]) options.amount = args[++i];
  if (args[i] === '--email' && args[i + 1]) options.email = args[++i];
}

// Generate a unique order ID
const orderId = `test-order-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

// Create the order payload (mimics Wix order webhook structure)
const orderPayload = {
  // Wix webhook wrapper
  eventType: 'OrderPaid',  // Must be OrderPaid for processing
  instanceId: 'test-instance-id',
  data: {
    order: {
      id: orderId,
      number: Math.floor(Math.random() * 100000),
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      currency: 'USD',
      
      // Buyer information
      buyerInfo: {
        id: 'buyer-' + Date.now(),
        email: options.email,
        firstName: 'Test',
        lastName: 'Customer',
        phone: '+1234567890'
      },
      
      // Order totals
      totals: {
        subtotal: (parseFloat(options.amount) * 0.9).toFixed(2),
        total: options.amount,
        tax: (parseFloat(options.amount) * 0.1).toFixed(2),
        discount: '0.00',
        shipping: '0.00',
        weight: '0',
        quantity: 1
      },
      priceSummary: {
        subtotal: { amount: (parseFloat(options.amount) * 0.9).toFixed(2), currency: 'USD' },
        total: { amount: options.amount, currency: 'USD' }
      },
      
      // Line items
      lineItems: [
        {
          id: 'line-item-1',
          productId: 'prod-' + Date.now(),
          name: 'Test Product',
          quantity: 1,
          price: (parseFloat(options.amount) * 0.9).toFixed(2),
          totalPrice: (parseFloat(options.amount) * 0.9).toFixed(2),
          sku: 'TEST-SKU-001',
          weight: '0',
          lineItemType: 'PHYSICAL'
        }
      ],
      
      // Shipping info
      shippingInfo: {
        shipmentDetails: {
          address: {
            addressLine1: '123 Test Street',
            city: 'Test City',
            subdivision: 'CA',
            country: 'US',
            postalCode: '12345'
          }
        }
      },
      
      // IMPORTANT: Buyer note with affiliate attribution
      // This is how affiliate data gets passed to the order
      buyerNote: `ref=${options.affiliate},cid=${options.campaign}`,
      
      // Additional fields
      paymentStatus: 'PAID',
      fulfillmentStatus: 'NOT_FULFILLED',
      channelInfo: {
        type: 'WEB'
      },
      
      // Custom fields (alternative attribution method)
      customFields: [
        { name: 'affiliateId', value: options.affiliate },
        { name: 'campaignId', value: options.campaign }
      ]
    }
  }
};

// Also test the flat payload format (some Wix versions)
const flatPayload = {
  id: orderId,
  number: orderPayload.data.order.number,
  buyerInfo: orderPayload.data.order.buyerInfo,
  totals: orderPayload.data.order.totals,
  lineItems: orderPayload.data.order.lineItems,
  buyerNote: orderPayload.data.order.buyerNote,
  createdDate: orderPayload.data.order.createdDate
};

console.log('\n📦 Sending fake order webhook...\n');
console.log('Configuration:');
console.log('  URL:', options.url);
console.log('  Affiliate:', options.affiliate);
console.log('  Campaign:', options.campaign);
console.log('  Amount:', options.amount);
console.log('  Email:', options.email);
console.log('  Order ID:', orderId);
console.log('');

// Determine http or https
const isHttps = options.url.startsWith('https');
const httpModule = isHttps ? https : http;

// Parse URL
const url = new URL(options.url + '/wix/orders/webhook');

const postData = JSON.stringify(orderPayload);

const requestOptions = {
  hostname: url.hostname,
  port: url.port || (isHttps ? 443 : 80),
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'X-Wix-Webhook-Test': 'true',
    'User-Agent': 'MarketIn-Test-Script/1.0'
  }
};

const req = httpModule.request(requestOptions, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response Status:', res.statusCode);
    console.log('Response Headers:', JSON.stringify(res.headers, null, 2));
    
    try {
      const jsonData = JSON.parse(data);
      console.log('Response Body:', JSON.stringify(jsonData, null, 2));
    } catch (e) {
      console.log('Response Body:', data);
    }
    
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('\n✅ Order webhook sent successfully!');
      console.log('\nNext steps:');
      console.log('1. Check server logs for webhook processing');
      console.log('2. Query /debug/conversions to see if conversion was queued');
      console.log('3. Run the conversion worker to process the queue');
    } else {
      console.log('\n❌ Order webhook failed');
    }
  });
});

req.on('error', (e) => {
  console.error('\n❌ Request error:', e.message);
  if (e.code === 'ECONNREFUSED') {
    console.log('\nMake sure the server is running:');
    console.log('  npm run dev');
  }
});

req.write(postData);
req.end();
