const request = require('supertest');
const app = require('../src/app');
const knex = require('../src/db');

// Mock the conversion queue service
jest.mock('../src/services/conversionQueue.service', () => ({
  enqueueConversion: jest.fn().mockResolvedValue({ jobId: 'test-job', status: 'pending' }),
  processQueue: jest.fn().mockResolvedValue({ processed: 0, succeeded: 0, failed: 0, dead: 0 })
}));

// Mock visitor session lookup
jest.mock('../src/controllers/visitorSession.controller', () => ({
  findAffiliateByVisitor: jest.fn().mockResolvedValue(null),
  trackSession: jest.fn(),
  getSession: jest.fn()
}));

describe('Order webhook', () => {
  beforeAll(async () => await knex.migrate.latest());
  afterAll(async () => { await knex.migrate.rollback(); await knex.destroy(); });

  test('POST /wix/orders/webhook accepts valid signed payload and enqueues conversion', async () => {
    const conversionQueue = require('../src/services/conversionQueue.service');
    
    // Prepare payload in Wix official format
    const payload = {
      entityId: 'order-123',
      eventType: 'OrderPaid',
      data: {
        order: {
          id: 'order-123',
          totalPrice: { amount: 123.45, currency: 'USD' },
          billingInfo: { email: 'test@example.com', fullName: 'Test User' },
          buyerNote: 'ref=AFF-123',
          lineItems: [
            { productId: 'prod-1', name: 'Test Product', quantity: 1, price: { amount: 123.45 } }
          ]
        }
      }
    };
    
    const raw = Buffer.from(JSON.stringify(payload));
    const secret = 'testsecret';
    process.env.WIX_WEBHOOK_SECRET = secret;
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    const res = await request(app)
      .post('/wix/orders/webhook')
      .set('x-wix-signature', hmac)
      .send(payload);
    
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.affiliateId).toBe('AFF-123');
    expect(conversionQueue.enqueueConversion).toHaveBeenCalled();
  });

  test('POST /wix/orders/webhook skips non-paid events', async () => {
    const payload = {
      entityId: 'order-456',
      eventType: 'OrderCreated', // Not a paid event
      data: {
        order: {
          id: 'order-456',
          totalPrice: { amount: 50, currency: 'USD' }
        }
      }
    };
    
    const raw = Buffer.from(JSON.stringify(payload));
    const secret = 'testsecret';
    process.env.WIX_WEBHOOK_SECRET = secret;
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    const res = await request(app)
      .post('/wix/orders/webhook')
      .set('x-wix-signature', hmac)
      .send(payload);
    
    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(true);
    expect(res.body.reason).toBe('not_paid_event');
  });

  test('POST /wix/test-webhook logs payload', async () => {
    const payload = { test: true, data: { foo: 'bar' } };
    
    const res = await request(app)
      .post('/wix/test-webhook')
      .send(payload);
    
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
  });
});

describe('Wix order payload parsing', () => {
  const { parseWixOrderPayload } = require('../src/controllers/orderWebhook.controller');

  test('parses official Wix webhook format', () => {
    const payload = {
      entityId: '2ad320aa-43c1-46fa-b856-62ce5bc023bb',
      slug: 'stores/orders',
      eventType: 'OrderPaid',
      data: {
        order: {
          id: '2ad320aa-43c1-46fa-b856-62ce5bc023bb',
          number: '10001',
          totalPrice: { amount: 199.99, currency: 'USD' },
          billingInfo: { email: 'john@example.com', fullName: 'John Doe' },
          buyerNote: 'ref=AFF123',
          lineItems: [
            { productId: '11c34e50', name: 'Black Hoodie', quantity: 1, price: { amount: 99.99, currency: 'USD' } }
          ]
        }
      }
    };

    const parsed = parseWixOrderPayload(payload);
    
    expect(parsed.orderId).toBe('2ad320aa-43c1-46fa-b856-62ce5bc023bb');
    expect(parsed.orderNumber).toBe('10001');
    expect(parsed.totalAmount).toBe(199.99);
    expect(parsed.currency).toBe('USD');
    expect(parsed.customerEmail).toBe('john@example.com');
    expect(parsed.customerName).toBe('John Doe');
    expect(parsed.affiliateId).toBe('AFF123');
    expect(parsed.products).toHaveLength(1);
    expect(parsed.products[0].name).toBe('Black Hoodie');
  });

  test('extracts affiliate from custom fields', () => {
    const payload = {
      orderId: 'order-789',
      total: { amount: 50 },
      customFields: { aid: 'AFFILIATE-999', cid: 'CAMPAIGN-1' }
    };

    const parsed = parseWixOrderPayload(payload);
    
    expect(parsed.affiliateId).toBe('AFFILIATE-999');
    expect(parsed.campaignId).toBe('CAMPAIGN-1');
  });
});
