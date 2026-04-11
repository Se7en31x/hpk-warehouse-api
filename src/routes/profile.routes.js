const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/profile.controller');

router.get('/', ctrl.getProfile);

module.exports = router;
