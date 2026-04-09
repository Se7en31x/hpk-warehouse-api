// src/routes/lot.routes.js
const express = require('express');
const router = express.Router();
const lotController = require('../controllers/lot.controller');

router.get('/', lotController.getAllLots);
router.get('/:id', lotController.getLotById);
router.patch('/:id/adjust', lotController.adjustLotStock);
router.patch('/:id/toggle-status', lotController.toggleStatus);
router.delete('/:id', lotController.deleteLot);
module.exports = router