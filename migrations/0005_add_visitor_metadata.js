/**
 * Migration: Add metadata column to visitor_sessions
 * Stores email, phone, customerId and other identity info linked during identify call
 */
exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('visitor_sessions');
  if (hasTable) {
    const hasColumn = await knex.schema.hasColumn('visitor_sessions', 'metadata');
    if (!hasColumn) {
      await knex.schema.alterTable('visitor_sessions', (table) => {
        table.text('metadata'); // JSON string with email, phone, customerId, orderId, etc.
      });
    }
  }
};

exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('visitor_sessions');
  if (hasTable) {
    const hasColumn = await knex.schema.hasColumn('visitor_sessions', 'metadata');
    if (hasColumn) {
      await knex.schema.alterTable('visitor_sessions', (table) => {
        table.dropColumn('metadata');
      });
    }
  }
};
