const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/report.controller');

// รายงานแบบแถว (item-level)
router.get('/stock-balance', ctrl.getStockBalanceReport);
router.get('/stock-movement', ctrl.getStockMovementReport);
router.get('/expired-lots', ctrl.getExpiredLotsReport);
router.get('/stock-out', ctrl.getStockOutReport);
router.get('/stock-in', ctrl.getStockInReport);

// รายงานแบบ header (document-level)
router.get('/requisitions', ctrl.getRequisitionReports);
// router.get('/stockins', ctrl.getStockInReports); // ถ้าไม่ใช้แบบ header ให้คอมเมนต์ไว้

module.exports = router;

