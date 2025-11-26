require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const routes = require('./routes');

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health / sanity route
app.get('/', (req, res) => {
  res.status(200).json({ message: 'OK' });
});

// Mount our routes
app.use('/auth', routes.auth);
app.use('/webhooks', routes.webhooks);

app.listen(PORT, () => {
  console.log(`Server running on PORT ${PORT}`);
});
