// Set test environment variables before loading app/knex
process.env.NODE_ENV = 'test';
process.env.DB_CLIENT = 'sqlite3';
process.env.DB_FILENAME = process.env.DB_FILENAME || '/tmp/marketin_test.sqlite'; // use file-backed DB for tests
process.env.WIX_CLIENT_ID = process.env.WIX_CLIENT_ID || 'test-client-id';

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
    await knex('wix_tokens').insert({ wix_client_id: 'mock', access_token: encrypt('token'), refresh_token: encrypt('r'), site_id: 'manual-site', created_at: new Date() });
    const res = await request(app).post('/inject').send({ siteId: 'manual-site', token: 'manual-token' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    const row = await knex('wix_tokens').where({ site_id: 'manual-site' }).first();
    expect(row.injected).toBeTruthy();
    expect(row.injection_status).toBe('success');
  });

  test('POST /wix/products/sync triggers sync, calls bulk API and returns mapping count', async () => {
    // Setup: ensure wix_tokens exists
    await knex('wix_tokens').del();
    await knex('product_mappings').del();
    const { encrypt } = require('../src/utils/crypto');
    await knex('wix_tokens').insert({ wix_client_id: 'mock', access_token: encrypt('token'), refresh_token: encrypt('r'), site_id: 'sync-site', created_at: new Date() });
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
