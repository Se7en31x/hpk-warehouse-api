'use strict';

const express          = require('express');
const router           = express.Router();
const lookupController = require('../controllers/lookup.controller');

// GET /v1/lookup/provinces
router.get('/provinces',                       lookupController.getProvinces);

// GET /v1/lookup/districts/:province_id   (province_id = 2-char code, e.g. "10")
router.get('/districts/:province_id',          lookupController.getDistricts);

// GET /v1/lookup/subdistricts/:district_id (district_id = 4-char code, e.g. "1001")
router.get('/subdistricts/:district_id',       lookupController.getSubdistricts);

// GET /v1/lookup/titles
router.get('/titles',                          lookupController.getTitles);

module.exports = router;
