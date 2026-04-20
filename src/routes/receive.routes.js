const express = require('express');
const router = express.Router();
const receiveController = require('../controllers/receive.controller');

router.get('/',                receiveController.getReceives);
router.get('/batch/:batchId',  receiveController.getBatchById);
router.post('/batch',          receiveController.createBatch);
router.post('/',               receiveController.createReceive);
router.patch('/:id/confirm',   receiveController.confirmReceive);
router.patch('/:id/cancel',    receiveController.cancelReceive);

module.exports = router;
