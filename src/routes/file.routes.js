const express = require('express');
const router = express.Router();
const fileController = require('../controllers/file.controller');
const { upload } = require('../middleware/upload');
// const { authWarehouse } = require('../middleware/auth');

router.patch('/items/:id/image', upload.single('image'), fileController.updateItemImage);
router.delete('/items/:id/image', fileController.removeItemImage);

module.exports = router;
