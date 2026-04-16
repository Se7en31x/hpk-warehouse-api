const express = require('express');
const router = express.Router();
const fileController = require('../controllers/file.controller');
const { upload, uploadDocument } = require('../middleware/upload');

router.patch('/items/:id/image',          upload.single('image'),    fileController.updateItemImage);
router.delete('/items/:id/image',                                    fileController.removeItemImage);
router.patch('/borrowers/:id/document',   uploadDocument.single('document'), fileController.uploadBorrowerDocument);

module.exports = router;
