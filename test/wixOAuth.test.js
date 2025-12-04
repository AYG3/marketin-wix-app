// Set test environment variables before loading app/knex
process.env.NODE_ENV = 'test';
process.env.DB_CLIENT = 'sqlite3';
process.env.DB_FILENAME = process.env.DB_FILENAME || '/tmp/marketin_test.sqlite'; // use file-backed DB for tests
process.env.WIX_CLIENT_ID = process.env.WIX_CLIENT_ID || 'test-client-id';
// Ensure no WIX_CLIENT_SECRET is present for instance header validation to be skipped
process.env.WIX_CLIENT_SECRET = '';

const request = require('supertest');
const app = require('../src/app');
const knex = require('../src/db');
const fs = require('fs');

// ensure a clean slate before running tests and run migrations
if (fs.existsSync(process.env.DB_FILENAME)) {
  try { fs.unlinkSync(process.env.DB_FILENAME); } catch (e) {}
}

beforeAll(async () => {
  await knex.migrate.latest();
});

// Mock wixApi module to avoid real HTTP calls
// Mock wixApi functions
jest.mock('../src/services/wixApi.service', () => ({
  exchangeCodeForToken: jest.fn().mockImplementation(async (code) => ({
    client_id: process.env.WIX_CLIENT_ID || 'mock-client',
    access_token: `mock_access_token_${code}`,
    refresh_token: `mock_refresh_token_${code}`,
    expires_at: new Date(Date.now() + 60 * 60 * 1000),
    site_id: 'mock-site-id',
    instance_id: 'mock-instance-id',
  })),
  injectHeadScript: jest.fn().mockResolvedValue({ ok: true, id: 'injection-1' }),
  // Provide default implementations for product sync and token refresh wrappers
  withTokenRefresh: jest.fn().mockImplementation(async (fn) => {
    // call the provided function with a mock access token
    return fn('mock_access_token');
  }),
  getAllProducts: jest.fn().mockResolvedValue([])
}));

describe('Wix OAuth endpoints', () => {
  test('GET /auth/install redirects to Wix', async () => {
    const res = await request(app).get('/auth/install');
    expect(res.status).toBe(302);
    // Wix URL should include client id and response_type=code
    expect(res.headers.location).toMatch(/wix.com\/oauth\/authorize/);
  });

  test('GET /auth/callback exchanges code and returns HTML', async () => {
    const res = await request(app).get('/auth/callback').query({ code: 'testcode' });
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/html/);
    expect(res.text).toContain('Market!N installed');
  });

  test('GET /auth/callback results in DB having injected=true', async () => {
    // Ensure a clean start
    await knex('wix_tokens').del();
    await request(app).get('/auth/callback').query({ code: 'testcode' });
    const row = await knex('wix_tokens').where({ site_id: 'mock-site-id' }).first();
    expect(row).toBeDefined();
    expect(row.injected).toBeTruthy();
    expect(row.injected_at).not.toBeNull();
  });

  test('on success: injection_attempts incremented and status = success', async () => {
    await knex('wix_tokens').del();
    await request(app).get('/auth/callback').query({ code: 'testcode' });
    const row = await knex('wix_tokens').where({ site_id: 'mock-site-id' }).first();
    expect(row.injection_attempts).toBeGreaterThanOrEqual(1);
    expect(row.injection_status).toBe('success');
  });

  test('on failure: injection_attempts = max retries, status = failed, injected=false', async () => {
    // arrange: make injectHeadScript fail
    const wixApi = require('../src/services/wixApi.service');
    const originalImpl = wixApi.injectHeadScript.getMockImplementation();
    wixApi.injectHeadScript.mockImplementation(async () => { throw new Error('injection failed'); });

    await knex('wix_tokens').del();
    const res = await request(app).get('/auth/callback').query({ code: 'testcode' });
    // callback will still respond with 200 (injection is attempted async within handler),
    // but DB should be updated to reflect failed injection attempts
    expect(res.status).toBe(200);
    const row = await knex('wix_tokens').where({ site_id: 'mock-site-id' }).first();
    expect(row.injection_attempts).toBeGreaterThanOrEqual(3);
    expect(row.injection_status).toBe('failed');
    expect(row.injected).toBeFalsy();
    // restore impl
    wixApi.injectHeadScript.mockImplementation(originalImpl);
  });

  test('POST /inject injects to provided site and updates DB', async () => {
    // reset and prepare
    await knex('wix_tokens').del();
    // insert a token row for site so inject.service can fetch if not passing token
    const { encrypt } = require('../src/utils/crypto');
    await knex('wix_tokens').insert({ wix_client_id: 'mock', access_token: encrypt('token'), refresh_token: encrypt('r'), site_id: 'manual-site', marketin_api_key: encrypt('test-marketin-key'), created_at: new Date() });
    const res = await request(app).post('/inject').send({ siteId: 'manual-site', token: 'manual-token' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    const row = await knex('wix_tokens').where({ site_id: 'manual-site' }).first();
    expect(row.injected).toBeTruthy();
    expect(row.injection_status).toBe('success');
  });

  test('POST /admin/iframe/settings saves Market!N API key (encrypted) and brand ID', async () => {
    // Arrange: ensure token exists
    await knex('wix_tokens').del();
    const { encrypt } = require('../src/utils/crypto');
    await knex('wix_tokens').insert({ wix_client_id: 'mock', access_token: encrypt('token'), refresh_token: encrypt('r'), site_id: 'key-site', created_at: new Date() });

    // Mock validateApiKey to succeed
    const marketin = require('../src/services/marketin.service');
    marketin.validateApiKey = jest.fn().mockResolvedValue({ valid: true });

    // Act: save brandId and API key
    const res = await request(app).post('/admin/iframe/settings').set('x-wix-instance', 'test.instance').send({ siteId: 'key-site', brandId: '12345', marketinApiKey: 'secret-api-key' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTruthy();

    // Assert DB row updated with encrypted key (not plain)
    const row = await knex('wix_tokens').where({ site_id: 'key-site' }).first();
    expect(row.brand_id).toBe('12345');
    expect(row.marketin_api_key).toBeDefined();
    expect(row.marketin_api_key).not.toBe('secret-api-key');

    // GET settings should show marketinApiKeySet
    const settingsRes = await request(app).get('/admin/iframe/settings').set('x-wix-instance', 'test.instance').query({ siteId: 'key-site' });
    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.marketinApiKeySet).toBeTruthy();
  });

  test('POST /admin/iframe/settings allows saving just API key when brandId already exists', async () => {
    // Arrange: create token with brandId already set
    await knex('wix_tokens').del();
    const { encrypt } = require('../src/utils/crypto');
    await knex('wix_tokens').insert({
      wix_client_id: 'mock',
      access_token: encrypt('token'),
      refresh_token: encrypt('r'),
      site_id: 'apikey-only-site',
      brand_id: 'existing-brand-123',
      created_at: new Date()
    });

    // Mock validateApiKey to succeed
    const marketin = require('../src/services/marketin.service');
    marketin.validateApiKey = jest.fn().mockResolvedValue({ valid: true });

    // Act: save just the API key (no brandId in request)
    const res = await request(app)
      .post('/admin/iframe/settings')
      .set('x-wix-instance', 'test.instance')
      .send({ siteId: 'apikey-only-site', marketinApiKey: 'new-secret-key' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTruthy();
    expect(res.body.brandId).toBe('existing-brand-123'); // Uses existing brandId

    // Assert DB row has API key set
    const row = await knex('wix_tokens').where({ site_id: 'apikey-only-site' }).first();
    expect(row.brand_id).toBe('existing-brand-123'); // brandId unchanged
    expect(row.marketin_api_key).toBeDefined();
    expect(row.marketin_api_key).not.toBe('new-secret-key'); // encrypted
  });

  test('POST /admin/iframe/settings requires brandId when not set in DB', async () => {
    // Arrange: create token without brandId
    await knex('wix_tokens').del();
    const { encrypt } = require('../src/utils/crypto');
    await knex('wix_tokens').insert({
      wix_client_id: 'mock',
      access_token: encrypt('token'),
      refresh_token: encrypt('r'),
      site_id: 'no-brand-site',
      created_at: new Date()
    });

    // Act: try to save just API key without brandId
    const res = await request(app)
      .post('/admin/iframe/settings')
      .set('x-wix-instance', 'test.instance')
      .send({ siteId: 'no-brand-site', marketinApiKey: 'some-key' });

    // Should fail because brandId required
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('brandId is required');
  });

  test('POST /wix/products/sync triggers sync, calls bulk API and returns mapping count', async () => {
    // Setup: ensure wix_tokens exists
    await knex('wix_tokens').del();
    await knex('product_mappings').del();
    const { encrypt } = require('../src/utils/crypto');
    await knex('wix_tokens').insert({ wix_client_id: 'mock', access_token: encrypt('token'), refresh_token: encrypt('r'), site_id: 'sync-site', marketin_api_key: encrypt('test-marketin-key'), created_at: new Date() });
    // stub marketin bulk sync to return fake product mappings for each product passed
    const marketin = require('../src/services/marketin.service');
    marketin.bulkSyncProducts = jest.fn().mockImplementation(async ({ apiKey, brandId, products }) => ({ products: products.map((p, i) => ({ wix_id: p.id, id: `m-${i}` })) }));

    const wixApi = require('../src/services/wixApi.service');
    // return a couple of mock products
    wixApi.getAllProducts = jest.fn().mockResolvedValue([{ id: 'w1', name: 'One', sku: 'W-1' }, { id: 'w2', name: 'Two', sku: 'W-2' }]);

    const res = await request(app).post('/wix/products/sync').send({ siteId: 'sync-site', brandId: 123 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTruthy();
    const rows = await knex('product_mappings').select();
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});

afterAll(async () => {
  // Close DB connections to allow Jest to exit cleanly
  try {
    await knex.destroy();
  } catch (err) {
    // ignore
  }
  // rollback migrations and remove DB file
  try { await knex.migrate.rollback(); } catch (e) {}
  try { if (fs.existsSync(process.env.DB_FILENAME)) fs.unlinkSync(process.env.DB_FILENAME); } catch (e) {}
});
