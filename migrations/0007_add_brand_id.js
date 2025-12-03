/**
 * Migration: Add brand_id to wix_tokens
 * 
 * The brand_id is the Market!N platform brand identifier that brand owners
 * enter when setting up the app. This links the Wix site to their Market!N account.
 */
exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('wix_tokens', 'brand_id');
  if (!hasColumn) {
    await knex.schema.alterTable('wix_tokens', (table) => {
      table.string('brand_id').nullable();
      table.string('brand_name').nullable();
      table.timestamp('brand_configured_at').nullable();
    });
  }
};

exports.down = async function(knex) {
  const hasBrandId = await knex.schema.hasColumn('wix_tokens', 'brand_id');
  if (hasBrandId) {
    await knex.schema.alterTable('wix_tokens', (table) => {
      table.dropColumn('brand_id');
      table.dropColumn('brand_name');
      table.dropColumn('brand_configured_at');
    });
  }
};
