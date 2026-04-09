const express = require('express');
const router = express.Router();
const receiveController = require('../controllers/receive.controller');

router.post('/', receiveController.createReceive);
router.get('/', receiveController.getReceives);
router.get('/:id', receiveController.getReceiveById);
router.patch('/:id/confirm', receiveController.confirmReceive);
router.patch('/:id/cancel', receiveController.cancelReceive);

module.exports = router;
