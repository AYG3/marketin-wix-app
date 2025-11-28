const request = require('supertest');
const app = require('../src/app');
const knex = require('../src/db');

// Single describe block to share the connection properly
describe('Visitor Session Tracking', () => {
  beforeAll(async () => await knex.migrate.latest());
  afterAll(async () => { 
    await knex.migrate.rollback(); 
    await knex.destroy(); 
  });

  describe('Session API endpoints', () => {
    test('POST /track/session creates new session', async () => {
      const payload = {
        visitorId: 'visitor-123',
        siteId: 'site-abc',
        affiliateId: 'AFF-001',
        campaignId: 'CAMP-001',
        productId: 'PROD-001',
        landingUrl: 'https://example.com/product/1?aid=AFF-001&cid=CAMP-001',
        utm_source: 'facebook',
        utm_medium: 'cpc',
        utm_campaign: 'summer_sale'
      };

      const res = await request(app)
        .post('/track/session')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('created');
      expect(res.body.sessionId).toBeDefined();
    });

    test('POST /track/session updates existing session', async () => {
      // Create a session first
      const createRes = await request(app)
        .post('/track/session')
        .send({
          sessionId: 'session-update-test',
          visitorId: 'visitor-456',
          siteId: 'site-def'
        });

      expect(createRes.status).toBe(201);

      // Update with affiliate info
      const updateRes = await request(app)
        .post('/track/session')
        .send({
          sessionId: 'session-update-test',
          affiliateId: 'AFF-NEW',
          campaignId: 'CAMP-NEW'
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.status).toBe('updated');
    });

    test('GET /track/session/:sessionId retrieves session', async () => {
      // Create a unique session for this test
      const uniqueSessionId = `session-get-test-${Date.now()}`;
      
      const createRes = await request(app)
        .post('/track/session')
        .send({
          sessionId: uniqueSessionId,
          visitorId: 'visitor-789',
          siteId: 'site-ghi',
          affiliateId: 'AFF-GET'
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.sessionId).toBe(uniqueSessionId);

      // Retrieve it
      const getRes = await request(app)
        .get(`/track/session/${uniqueSessionId}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.affiliate_id).toBe('AFF-GET');
      expect(getRes.body.site_id).toBe('site-ghi');
    });

    test('GET /track/session/:sessionId returns 404 for missing session', async () => {
      const res = await request(app)
        .get('/track/session/non-existent-session');

      expect(res.status).toBe(404);
    });
  });

  describe('Affiliate Attribution Lookup', () => {
    beforeAll(async () => {
      // Seed a test session for lookup tests
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await knex('visitor_sessions').insert({
        session_id: 'lookup-test-session',
        visitor_id: 'lookup-visitor',
        site_id: 'lookup-site',
        affiliate_id: 'AFF-LOOKUP',
        campaign_id: 'CAMP-LOOKUP',
        expires_at: expiresAt,
        created_at: now
      });
    });

    test('finds affiliate by session ID', async () => {
      const { findAffiliateByVisitor } = require('../src/controllers/visitorSession.controller');
      
      const result = await findAffiliateByVisitor({
        sessionId: 'lookup-test-session'
      });

      expect(result).not.toBeNull();
      expect(result.affiliateId).toBe('AFF-LOOKUP');
      expect(result.campaignId).toBe('CAMP-LOOKUP');
      expect(result.source).toBe('session');
    });

    test('finds affiliate by visitor ID', async () => {
      const { findAffiliateByVisitor } = require('../src/controllers/visitorSession.controller');

      const result = await findAffiliateByVisitor({
        visitorId: 'lookup-visitor',
        siteId: 'lookup-site'
      });

      expect(result).not.toBeNull();
      expect(result.affiliateId).toBe('AFF-LOOKUP');
      expect(result.source).toBe('visitor_id');
    });

    test('returns null for unknown visitor', async () => {
      const { findAffiliateByVisitor } = require('../src/controllers/visitorSession.controller');

      const result = await findAffiliateByVisitor({
        visitorId: 'unknown-visitor'
      });

      expect(result).toBeNull();
    });
  });
});
