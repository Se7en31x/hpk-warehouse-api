const stockMovementService = require('../services/stockmovement.service');
const util = require('../utils/response');

const parseListQuery = (query) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const keyword = (query.keyword || '').toString().trim();
    const type = (query.type || '').toString().trim();
    const start_date = (query.start_date || '').toString().trim();
    const end_date = (query.end_date || '').toString().trim();
    return { page, limit, keyword, type, start_date, end_date };
};

const getMovements = async (req, res) => {
    try {
        const query = parseListQuery(req.query);
        const result = await stockMovementService.getAllMovements(query);
        return util.sendListResponse(res, 200, 'List stock movements success', result);
    } catch (error) {
        return util.sendResponse(res, 500, error.message);
    }
};

const getMovementById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return util.sendResponse(res, 400, 'Invalid parameter');
        const movement = await stockMovementService.getMovementById(id);
        return util.sendResponse(res, 200, 'Get stock movement success', movement);
    } catch (error) {
        return util.sendResponse(res, 404, error.message);
    }
};

module.exports = {
    getMovements,
    getMovementById,
};
