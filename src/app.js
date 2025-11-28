require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const routes = require('./routes');

const app = express();

app.use(cors());
// capture raw body for webhook signature validation
app.use(bodyParser.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(bodyParser.urlencoded({ extended: true }));

// Health / sanity route
app.get('/', (req, res) => {
  res.status(200).json({ message: 'OK' });
});

// Mount routes
app.use('/auth', routes.auth);
app.use('/webhooks', routes.webhooks);
app.use('/inject', routes.inject);
app.use('/wix', routes.wix);
app.use('/track', routes.track);
app.use('/admin', routes.admin);

module.exports = app;
