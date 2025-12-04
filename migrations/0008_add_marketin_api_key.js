/**
 * Migration: Add marketin_api_key to wix_tokens
 * 
 * This adds an encrypted field to store brand-specific Market!N API keys
 */
exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('wix_tokens', 'marketin_api_key');
  if (!hasColumn) {
    await knex.schema.alterTable('wix_tokens', (table) => {
      table.text('marketin_api_key').nullable(); // store encrypted value
    });
  }
};

exports.down = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('wix_tokens', 'marketin_api_key');
  if (hasColumn) {
    await knex.schema.alterTable('wix_tokens', (table) => {
      table.dropColumn('marketin_api_key');
    });
  }
};
