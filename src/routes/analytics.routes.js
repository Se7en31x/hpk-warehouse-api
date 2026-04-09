const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/analytics.controller');

router.get('/dashboard', ctrl.getDashboardAnalytics);

module.exports = router;

