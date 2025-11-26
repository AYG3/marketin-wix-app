const express = require('express');
const authRoutes = require('./auth.routes');
const webhookRoutes = require('./webhook.routes');

module.exports = {
  auth: authRoutes,
  webhooks: webhookRoutes,
};
