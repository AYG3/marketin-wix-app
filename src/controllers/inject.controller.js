const injectService = require('../services/inject.service');

exports.inject = async (req, res) => {
  try {
    const { siteId, token } = req.body;
    if (!siteId || !token) return res.status(400).json({ error: 'Missing siteId or token' });

    const resp = await injectService.injectPixel(siteId, token);
    res.json({ ok: true, injected: resp.ok, details: resp.details });
  } catch (err) {
    console.error('inject controller error', err?.response?.data || err.message || err);
    res.status(500).json({ error: 'Injection failed' });
  }
};
