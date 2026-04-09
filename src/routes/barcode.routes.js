const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/barcode.controller');

router.get('/resolve', ctrl.resolveBarcode);

module.exports = router;
