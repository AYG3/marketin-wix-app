const express = require('express');
const authRoutes = require('./auth.routes');
const webhookRoutes = require('./webhook.routes');
const injectRoutes = require('./inject.routes');
const wixRoutes = require('./wix.routes');

module.exports = {
  auth: authRoutes,
  webhooks: webhookRoutes,
  inject: injectRoutes,
  wix: wixRoutes,
};
