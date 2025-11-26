const express = require('express');
const authRoutes = require('./auth.routes');
const webhookRoutes = require('./webhook.routes');
const injectRoutes = require('./inject.routes');

module.exports = {
  auth: authRoutes,
  webhooks: webhookRoutes,
  inject: injectRoutes,
};
