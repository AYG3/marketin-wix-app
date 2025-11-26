exports.up = async function(knex) {
  const hasProducts = await knex.schema.hasTable('product_mappings');
  if (!hasProducts) {
    await knex.schema.createTable('product_mappings', (table) => {
      table.increments('id');
      table.string('wix_product_id').notNullable().index();
      table.string('marketin_product_id').notNullable().index();
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.unique(['wix_product_id']);
    });
  }
};

exports.down = async function(knex) {
  const hasProducts = await knex.schema.hasTable('product_mappings');
  if (hasProducts) await knex.schema.dropTable('product_mappings');
};
