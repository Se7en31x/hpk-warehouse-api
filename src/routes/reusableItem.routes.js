const express = require('express');
const router = express.Router();
const reusableController = require('../controllers/reusableItem.controller');

router.post('/receive', reusableController.createReusableReceive);
router.get('/', reusableController.getReusableUnits);
router.get('/barcodes/resolve', reusableController.resolveBarcode);
router.get('/returnable-summary', reusableController.getReturnableWithdrawSummary);
router.post('/return-requests', reusableController.createReturnRequest);
router.get('/return-requests', reusableController.getReturnRequests);
router.get('/return-requests/:id', reusableController.getReturnRequestById);
router.post('/return-requests/:id/process', reusableController.processReturnRequest);
router.delete('/return-requests/:id', reusableController.deleteReturnRequest);
router.get('/:id', reusableController.getReusableUnitById);
router.post('/:id/return-from-withdraw', reusableController.returnReusableFromWithdraw);
router.patch('/:id', reusableController.updateReusableUnit);

module.exports = router;
