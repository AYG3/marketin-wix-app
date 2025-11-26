const axios = require('axios');

const marketinClient = axios.create({
  baseURL: process.env.MARKETIN_API_URL,
  headers: {
    'Authorization': `Bearer ${process.env.MARKETIN_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

module.exports = {
  client: marketinClient
};
