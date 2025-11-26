exports.up = async function(knex) {
  const hasWixTokens = await knex.schema.hasTable('wix_tokens');
  if (!hasWixTokens) {
    await knex.schema.createTable('wix_tokens', (table) => {
      table.increments('id');
      table.string('wix_client_id');
      table.text('access_token');
      table.text('refresh_token');
      table.timestamp('expires_at');
      table.string('site_id');
      table.string('instance_id');
      table.boolean('injected').defaultTo(false);
      table.timestamp('injected_at');
      table.integer('injection_attempts').defaultTo(0);
      table.string('injection_status').defaultTo('pending');
      table.timestamp('created_at');
    });
  }

  const hasOrderWebhooks = await knex.schema.hasTable('order_webhooks');
  if (!hasOrderWebhooks) {
    await knex.schema.createTable('order_webhooks', (table) => {
      table.increments('id');
      table.text('payload');
      table.timestamp('processed_at');
      table.timestamp('created_at');
    });
  }
};

exports.down = async function(knex) {
  const hasOrderWebhooks = await knex.schema.hasTable('order_webhooks');
  if (hasOrderWebhooks) await knex.schema.dropTable('order_webhooks');
  const hasWixTokens = await knex.schema.hasTable('wix_tokens');
  if (hasWixTokens) await knex.schema.dropTable('wix_tokens');
};
