const express = require('express');
const authRoutes = require('./auth.routes');
const webhookRoutes = require('./webhook.routes');
const injectRoutes = require('./inject.routes');
const wixRoutes = require('./wix.routes');
const trackRoutes = require('./track.routes');
const adminRoutes = require('./admin.routes');

module.exports = {
  auth: authRoutes,
  webhooks: webhookRoutes,
  inject: injectRoutes,
  wix: wixRoutes,
  track: trackRoutes,
  admin: adminRoutes,
};
