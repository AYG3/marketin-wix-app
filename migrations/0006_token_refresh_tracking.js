/**
 * Migration: Add token refresh tracking columns to wix_tokens
 */
exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('wix_tokens');
  if (!hasTable) return;

  // Add columns for refresh tracking
  const hasLastRefreshAt = await knex.schema.hasColumn('wix_tokens', 'last_refresh_at');
  if (!hasLastRefreshAt) {
    await knex.schema.alterTable('wix_tokens', (table) => {
      table.timestamp('last_refresh_at').nullable();
    });
  }

  const hasExpiresIn = await knex.schema.hasColumn('wix_tokens', 'expires_in');
  if (!hasExpiresIn) {
    await knex.schema.alterTable('wix_tokens', (table) => {
      table.integer('expires_in').nullable(); // seconds until expiry
    });
  }

  const hasUninstalledAt = await knex.schema.hasColumn('wix_tokens', 'uninstalled_at');
  if (!hasUninstalledAt) {
    await knex.schema.alterTable('wix_tokens', (table) => {
      table.timestamp('uninstalled_at').nullable();
    });
  }

  const hasIsActive = await knex.schema.hasColumn('wix_tokens', 'is_active');
  if (!hasIsActive) {
    await knex.schema.alterTable('wix_tokens', (table) => {
      table.boolean('is_active').defaultTo(true);
    });
  }
};

exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('wix_tokens');
  if (!hasTable) return;

  const hasLastRefreshAt = await knex.schema.hasColumn('wix_tokens', 'last_refresh_at');
  if (hasLastRefreshAt) {
    await knex.schema.alterTable('wix_tokens', (table) => {
      table.dropColumn('last_refresh_at');
    });
  }

  const hasExpiresIn = await knex.schema.hasColumn('wix_tokens', 'expires_in');
  if (hasExpiresIn) {
    await knex.schema.alterTable('wix_tokens', (table) => {
      table.dropColumn('expires_in');
    });
  }

  const hasUninstalledAt = await knex.schema.hasColumn('wix_tokens', 'uninstalled_at');
  if (hasUninstalledAt) {
    await knex.schema.alterTable('wix_tokens', (table) => {
      table.dropColumn('uninstalled_at');
    });
  }

  const hasIsActive = await knex.schema.hasColumn('wix_tokens', 'is_active');
  if (hasIsActive) {
    await knex.schema.alterTable('wix_tokens', (table) => {
      table.dropColumn('is_active');
    });
  }
};
