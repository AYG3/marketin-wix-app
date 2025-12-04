const request = require('supertest');
const app = require('../src/app');
const knex = require('../src/db');

describe('product sync chunking', () => {
  beforeAll(async () => {
    await knex.migrate.latest();
  });
  afterAll(async () => {
    await knex.migrate.rollback();
    await knex.destroy();
  });

  test('chunked sync enqueues and creates mapping', async () => {
    await knex('wix_tokens').del();
    const { encrypt } = require('../src/utils/crypto');
    await knex('wix_tokens').insert({ wix_client_id: 'mock', access_token: encrypt('token'), refresh_token: encrypt('r'), site_id: 'chunk-site', marketin_api_key: encrypt('test-marketin-key'), created_at: new Date() });
    const wixApi = require('../src/services/wixApi.service');
    // generate a lot of products to force chunking
    const products = [];
    for (let i = 0; i < 120; i++) products.push({ id: `w-${i}`, name: `W ${i}`, sku: `W-${i}` });
    wixApi.getAllProducts = jest.fn().mockResolvedValue(products);
    const marketin = require('../src/services/marketin.service');
    marketin.bulkSyncProducts = jest.fn().mockImplementation(async ({ brandId, products }) => ({ products: products.map((p, idx) => ({ wix_id: p.id, id: `m-${p.id}` })) }));

    const res = await request(app).post('/wix/products/sync').send({ siteId: 'chunk-site', brandId: 123 });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(120);
    const rows = await knex('product_mappings').select();
    expect(rows.length).toBe(120);
  });
});
