/**
 * Visitor Session Controller
 * Handles tracking endpoint for capturing affiliate/campaign info from browser SDK
 */
const knex = require('../db');
const crypto = require('crypto');

/**
 * POST /track/session
 * Called by frontend SDK to capture affiliate attribution info
 * Body: { sessionId, visitorId, siteId, affiliateId, campaignId, productId, landingUrl, referrerUrl, utm_*, ipAddress, userAgent, country, deviceType }
 */
exports.trackSession = async (req, res) => {
  try {
    const {
      sessionId,
      visitorId,
      siteId,
      affiliateId,
      campaignId,
      productId,
      landingUrl,
      referrerUrl,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      country,
      deviceType
    } = req.body;

    // Generate session ID if not provided
    const finalSessionId = sessionId || crypto.randomUUID();
    
    // Extract IP from request headers (handle proxies)
    const ipAddress = req.body.ipAddress || 
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
      req.socket?.remoteAddress || 
      null;
    
    const userAgent = req.body.userAgent || req.headers['user-agent'] || null;

    // Session expires after 30 days (configurable)
    const sessionTTLDays = parseInt(process.env.SESSION_TTL_DAYS || '30', 10);
    const expiresAt = new Date(Date.now() + sessionTTLDays * 24 * 60 * 60 * 1000);

    // Upsert: update existing session or create new
    const existing = await knex('visitor_sessions')
      .where('session_id', finalSessionId)
      .first();

    if (existing) {
      // Update with new info (affiliate may have been captured later in journey)
      await knex('visitor_sessions')
        .where('session_id', finalSessionId)
        .update({
          affiliate_id: affiliateId || existing.affiliate_id,
          campaign_id: campaignId || existing.campaign_id,
          product_id: productId || existing.product_id,
          utm_source: utm_source || existing.utm_source,
          utm_medium: utm_medium || existing.utm_medium,
          utm_campaign: utm_campaign || existing.utm_campaign,
          utm_content: utm_content || existing.utm_content,
          utm_term: utm_term || existing.utm_term,
          expires_at: expiresAt,
          updated_at: new Date()
        });
      
      return res.status(200).json({ 
        status: 'updated', 
        sessionId: finalSessionId 
      });
    }

    // Create new session
    const now = new Date().toISOString();
    await knex('visitor_sessions').insert({
      session_id: finalSessionId,
      site_id: siteId,
      visitor_id: visitorId,
      affiliate_id: affiliateId,
      campaign_id: campaignId,
      product_id: productId,
      landing_url: landingUrl,
      referrer_url: referrerUrl,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      ip_address: ipAddress,
      user_agent: userAgent,
      country,
      device_type: deviceType,
      expires_at: expiresAt.toISOString(),
      created_at: now,
      updated_at: now
    });

    res.status(201).json({ 
      status: 'created', 
      sessionId: finalSessionId 
    });
  } catch (err) {
    console.error('trackSession error', err?.message || err);
    res.status(500).json({ error: 'Failed to track session' });
  }
};

/**
 * GET /track/session/:sessionId
 * Retrieve session info (used internally for order attribution)
 */
exports.getSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await knex('visitor_sessions')
      .where('session_id', sessionId)
      .where('expires_at', '>', new Date().toISOString())
      .first();
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    
    res.status(200).json(session);
  } catch (err) {
    console.error('getSession error', err?.message || err);
    res.status(500).json({ error: 'Failed to retrieve session' });
  }
};

/**
 * Internal: Lookup affiliate from visitor session
 * Used by order webhook handler for attribution
 */
exports.findAffiliateByVisitor = async ({ siteId, visitorId, email, sessionId }) => {
  try {
    const now = new Date().toISOString();
    
    // Priority 1: Direct session lookup
    if (sessionId) {
      const session = await knex('visitor_sessions')
        .where('session_id', sessionId)
        .where('expires_at', '>', now)
        .whereNotNull('affiliate_id')
        .first();
      if (session?.affiliate_id) {
        return {
          affiliateId: session.affiliate_id,
          campaignId: session.campaign_id,
          productId: session.product_id,
          source: 'session'
        };
      }
    }

    // Priority 2: Visitor ID lookup (most recent session with affiliate)
    if (visitorId) {
      const session = await knex('visitor_sessions')
        .where('visitor_id', visitorId)
        .where(builder => {
          if (siteId) builder.where('site_id', siteId);
        })
        .where('expires_at', '>', now)
        .whereNotNull('affiliate_id')
        .orderBy('created_at', 'desc')
        .first();
      if (session?.affiliate_id) {
        return {
          affiliateId: session.affiliate_id,
          campaignId: session.campaign_id,
          productId: session.product_id,
          source: 'visitor_id'
        };
      }
    }

    // Priority 3: Site-level recent session with affiliate (last 24 hours)
    if (siteId) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const session = await knex('visitor_sessions')
        .where('site_id', siteId)
        .where('expires_at', '>', now)
        .where('created_at', '>', cutoff)
        .whereNotNull('affiliate_id')
        .orderBy('created_at', 'desc')
        .first();
      if (session?.affiliate_id) {
        return {
          affiliateId: session.affiliate_id,
          campaignId: session.campaign_id,
          productId: session.product_id,
          source: 'site_recent'
        };
      }
    }

    return null;
  } catch (err) {
    console.error('findAffiliateByVisitor error', err?.message || err);
    return null;
  }
};
