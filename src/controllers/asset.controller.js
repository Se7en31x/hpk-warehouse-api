const assetService = require('../services/asset.service');
const util = require('../utils/response');

const getAssets = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const keyword = req.query.keyword || '';
        const department_id = req.query.department_id || '';
        const status = req.query.status || '';
        const item_id = req.query.item_id || '';

        const result = await assetService.getAssets({ page, limit, keyword, department_id, status, item_id });
        return util.sendListResponse(res, 200, 'ok', result);
    } catch (err) {
        next(err);
    }
};

const getAssetById = async (req, res, next) => {
    try {
        const result = await assetService.getAssetById(req.params.id);
        return util.sendResponse(res, 200, result);
    } catch (err) {
        next(err);
    }
};

const updateAsset = async (req, res, next) => {
    try {
        const result = await assetService.updateAsset(req.params.id, req.body);
        return util.sendResponse(res, 200, result);
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAssets,
    getAssetById,
    updateAsset,
};
