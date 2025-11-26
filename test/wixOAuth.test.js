// Set test environment variables before loading app/knex
process.env.NODE_ENV = 'test';
process.env.DB_CLIENT = 'sqlite3';
process.env.DB_FILENAME = ':memory:'; // use in-memory DB for tests
process.env.WIX_CLIENT_ID = process.env.WIX_CLIENT_ID || 'test-client-id';

const request = require('supertest');
const app = require('../src/app');
const knex = require('../src/db/knex');

// Mock wixApi module to avoid real HTTP calls
jest.mock('../src/services/wixApi.service', () => ({
  exchangeCodeForToken: jest.fn().mockImplementation(async (code) => ({
    client_id: process.env.WIX_CLIENT_ID || 'mock-client',
    access_token: `mock_access_token_${code}`,
    refresh_token: `mock_refresh_token_${code}`,
    expires_at: new Date(Date.now() + 60 * 60 * 1000),
    site_id: 'mock-site-id',
    instance_id: 'mock-instance-id',
  }))
}));

// Mock inject service so it doesn't do external calls
jest.mock('../src/services/inject.service', () => ({
  injectPixel: jest.fn().mockResolvedValue({ ok: true })
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
});

afterAll(async () => {
  // Close DB connections to allow Jest to exit cleanly
  try {
    await knex.destroy();
  } catch (err) {
    // ignore
  }
});
