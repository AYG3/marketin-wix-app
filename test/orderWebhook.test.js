const request = require('supertest');
const app = require('../src/app');
const knex = require('../src/db');

// mock marketin.sendConversion
jest.mock('../src/services/marketin.service', () => ({
  sendConversion: jest.fn().mockResolvedValue({ ok: true })
}));

describe('Order webhook', () => {
  beforeAll(async () => await knex.migrate.latest());
  afterAll(async () => { await knex.migrate.rollback(); await knex.destroy(); });

  test('POST /wix/orders/webhook accepts valid signed payload and calls marketin', async () => {
    const marketin = require('../src/services/marketin.service');
    // prepare payload
    const payload = { orderId: 'o1', total: { amount: 123.45, currency: 'USD' }, buyer: { email: 'test@example.com', affiliateId: 'aff-1' } };
    const raw = Buffer.from(JSON.stringify(payload));
    const secret = 'testsecret';
    process.env.WIX_WEBHOOK_SECRET = secret;
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    const res = await request(app).post('/wix/orders/webhook').set('x-wix-signature', hmac).send(payload);
    expect(res.status).toBe(200);
    expect(marketin.sendConversion).toHaveBeenCalled();
  });
});
