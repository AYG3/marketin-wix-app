const express = require('express');
const router = express.Router();
const injectController = require('../controllers/inject.controller');

router.post('/', injectController.inject);

module.exports = router;
