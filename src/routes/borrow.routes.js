const express = require('express');
const router = express.Router();
const requisitionController = require('../controllers/requisition.controller');

// GET /v1/borrows/active — รายการยืมที่ยังไม่คืน (สำหรับหน้าติดตามการคืน)
router.get('/active', requisitionController.getActiveBorrows);

// PUT /v1/borrows/return/:id — บันทึกการรับคืนพัสดุ (สำหรับเจ้าหน้าที่คลัง)
router.put('/return/:id', requisitionController.processReturn);

module.exports = router;
