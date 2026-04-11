const express = require('express');
const router = express.Router();
const requisitionController = require('../controllers/requisition.Controller');

router.get('/active',      requisitionController.getActiveBorrows);
router.put('/return/:id',  requisitionController.processReturn);

module.exports = router;
