/**
 * Migration: conversion_queue
 * DB-backed queue for retry logic on failed conversion sends
 */
exports.up = async function(knex) {
  const hasQueue = await knex.schema.hasTable('conversion_queue');
  if (!hasQueue) {
    await knex.schema.createTable('conversion_queue', (table) => {
      table.increments('id');
      table.string('job_id').notNullable().unique().index(); // idempotency key
      table.string('status').notNullable().defaultTo('pending').index(); // pending, processing, completed, failed, dead
      table.integer('attempts').defaultTo(0);
      table.integer('max_attempts').defaultTo(5);
      table.timestamp('next_retry_at').index();
      table.timestamp('last_attempted_at');
      table.text('payload'); // JSON stringified conversion payload
      table.text('last_error');
      table.string('error_code');
      table.integer('order_webhook_id').index(); // FK to order_webhooks
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('completed_at');
      
      // index for worker polling
      table.index(['status', 'next_retry_at']);
    });
  }

  const hasFailures = await knex.schema.hasTable('conversion_failures');
  if (!hasFailures) {
    await knex.schema.createTable('conversion_failures', (table) => {
      table.increments('id');
      table.integer('queue_id').references('id').inTable('conversion_queue').onDelete('SET NULL');
      table.string('job_id').index();
      table.text('payload');
      table.text('error_message');
      table.string('error_code');
      table.integer('http_status');
      table.text('response_body');
      table.boolean('alert_sent').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function(knex) {
  const hasFailures = await knex.schema.hasTable('conversion_failures');
  if (hasFailures) await knex.schema.dropTable('conversion_failures');
  const hasQueue = await knex.schema.hasTable('conversion_queue');
  if (hasQueue) await knex.schema.dropTable('conversion_queue');
};
