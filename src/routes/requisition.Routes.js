const express = require('express');
const router = express.Router();
const requisitionController = require('../controllers/requisition.Controller');

router.get('/',            requisitionController.getRequisitions);
router.get('/:id',         requisitionController.getRequisitionById);
router.post('/',           requisitionController.createRequisition);
router.put('/approve/:id', requisitionController.approveRequisition);
router.put('/deliver/:id', requisitionController.completeDelivery);
router.put('/reject/:id',  requisitionController.rejectRequisition);
router.delete('/:id',      requisitionController.cancelRequisition);

module.exports = router;
