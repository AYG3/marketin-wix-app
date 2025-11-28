/**
 * Migration: visitor_sessions
 * Captures affiliate/campaign info from visitor sessions for reliable attribution
 */
exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('visitor_sessions');
  if (!hasTable) {
    await knex.schema.createTable('visitor_sessions', (table) => {
      table.increments('id');
      table.string('session_id').notNullable().index();
      table.string('site_id').index();
      table.string('visitor_id').index(); // fingerprint or cookie-based id
      table.string('affiliate_id').index();
      table.string('campaign_id').index();
      table.string('product_id').index();
      table.string('landing_url', 2048);
      table.string('referrer_url', 2048);
      table.string('utm_source');
      table.string('utm_medium');
      table.string('utm_campaign');
      table.string('utm_content');
      table.string('utm_term');
      table.string('ip_address');
      table.string('user_agent', 1024);
      table.string('country');
      table.string('device_type'); // desktop, mobile, tablet
      table.timestamp('expires_at');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // composite index for fast affiliate lookups
      table.index(['site_id', 'visitor_id', 'created_at']);
    });
  }
};

exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('visitor_sessions');
  if (hasTable) await knex.schema.dropTable('visitor_sessions');
};
