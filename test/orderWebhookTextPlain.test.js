const request = require('supertest');
const app = require('../src/app');
const knex = require('../src/db');

describe('Order webhook text/plain handling', () => {
  beforeAll(async () => await knex.migrate.latest());
  afterAll(async () => { await knex.migrate.rollback(); await knex.destroy(); });

  test('POST /wix/test-webhook accepts text/plain JSON body and stores parsed payload', async () => {
    const payload = { test: true, data: { foo: 'bar' } };
    const raw = JSON.stringify(payload);

    const res = await request(app)
      .post('/wix/test-webhook')
      .set('Content-Type', 'text/plain')
      .send(raw);

    expect(res.status).toBe(200);

    // verify it was stored - find latest test webhook (payload includes "_test":true)
    const row = await knex('order_webhooks').whereRaw("payload LIKE ?", ['%\"_test\":true%']).orderBy('created_at', 'desc').first();
    console.log('DB payload:', row.payload);
    expect(row).toBeDefined();
    const dbPayload = JSON.parse(row.payload);
    expect(dbPayload._test).toBe(true);
    expect(dbPayload.body).toMatchObject({ test: true, data: { foo: 'bar' } });
  });
});
