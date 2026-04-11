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

// รายงานแจ้งเตือน
router.get('/low-stock', ctrl.getLowStockReport);

// รายงานใหม่
router.get('/reusable-items', ctrl.getReusableItemsReport);
router.get('/assets', ctrl.getAssetReport);
router.get('/near-expiry', ctrl.getNearExpiryReport);
router.get('/inventory-balance', ctrl.getInventoryBalanceSummary);

module.exports = router;

