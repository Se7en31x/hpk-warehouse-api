const express = require('express');
const router = express.Router();
const requisitionController = require('../controllers/requisition.Controller');
// const { auth, authWarehouse, authUser } = require('../middleware/auth'); // สมมติว่าไฟล์ชื่อ auth.js

// 1. ดึงข้อมูล (ดูได้ทุก Role ที่ผ่านการ Login)
router.get('/', requisitionController.getRequisitions);
router.get('/:id', requisitionController.getRequisitionById);

// 2. สร้างใบเบิก (เฉพาะ User หรือ Role ที่ได้รับอนุญาต)
router.post('/', requisitionController.createRequisition);

// 3. อนุมัติ/ปฏิเสธ (เฉพาะเจ้าหน้าที่คลัง - Warehouse Role)
router.put('/approve/:id', requisitionController.approveRequisition);
router.put('/deliver/:id', requisitionController.completeDelivery);
router.put('/reject/:id', requisitionController.rejectRequisition);
router.delete('/:id', requisitionController.cancelRequisition);

module.exports = router;