const express = require('express');
const router = express.Router();
const fileController = require('../controllers/file.controller');
const { upload, uploadDocument } = require('../middleware/upload');

router.patch('/items/:id/image',          upload.single('image'),    fileController.updateItemImage);
router.delete('/items/:id/image',                                    fileController.removeItemImage);
router.patch('/borrowers/:id/document',   uploadDocument.array('document', 5), fileController.uploadBorrowerDocument);

// Multer per-request file limit — must match MAX_RETURN_ATTACHMENTS in file.service.js
const RETURN_UPLOAD_LIMIT = 10;

// ── Return attachments (BORROW flow: submit by requester / verify by warehouse) ──
router.patch(
    '/returns/borrow/:id/submit-attachments',
    uploadDocument.array('files', RETURN_UPLOAD_LIMIT),
    fileController.uploadBorrowReturnSubmit
);
router.delete(
    '/returns/borrow/:id/submit-attachments',
    fileController.deleteBorrowReturnSubmit
);
router.patch(
    '/returns/borrow/:id/verify-attachments',
    uploadDocument.array('files', RETURN_UPLOAD_LIMIT),
    fileController.uploadBorrowReturnVerify
);
router.delete(
    '/returns/borrow/:id/verify-attachments',
    fileController.deleteBorrowReturnVerify
);

// ── Return attachments (DEPARTMENT flow: submit by department / process by warehouse) ──
router.patch(
    '/returns/department/:id/submit-attachments',
    uploadDocument.array('files', RETURN_UPLOAD_LIMIT),
    fileController.uploadDepartmentReturnSubmit
);
router.delete(
    '/returns/department/:id/submit-attachments',
    fileController.deleteDepartmentReturnSubmit
);
router.patch(
    '/returns/department/:id/process-attachments',
    uploadDocument.array('files', RETURN_UPLOAD_LIMIT),
    fileController.uploadDepartmentReturnProcess
);
router.delete(
    '/returns/department/:id/process-attachments',
    fileController.deleteDepartmentReturnProcess
);

module.exports = router;
