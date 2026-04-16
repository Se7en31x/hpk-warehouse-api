const express = require('express');
const router = express.Router();
const assetController = require('../controllers/asset.controller');

router.get('/', assetController.getAssets);
router.get('/counts', assetController.getAssetCounts); // must be before /:id
router.get('/:id', assetController.getAssetById);
router.patch('/:id', assetController.updateAsset);

module.exports = router;
