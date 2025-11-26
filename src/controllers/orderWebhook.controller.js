const knex = require('../db');

exports.handleOrderWebhook = async (req, res) => {
  try {
    const order = req.body;
    // basic ack
    await knex('order_webhooks').insert({ payload: JSON.stringify(order), created_at: new Date() });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('handleOrderWebhook error', err);
    res.status(500).json({ error: 'Could not process webhook' });
  }
};
