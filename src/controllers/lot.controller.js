const lotService = require('../services/lot.service');
const { sendListResponse, sendResponse } = require('../utils/response');

const parseListQuery = (query = {}) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const keyword = (query.keyword || query.search || '').toString().trim();
    const warehouse_id = (query.warehouse_id || query.warehouse || '').toString().trim();
    const category_id = (query.category_id || query.category || '').toString().trim();
    const status = (query.status || '').toString().trim();
    const expiry_status = (query.expiry_status || '').toString().trim();

    return { page, limit, keyword, warehouse_id, category_id, status, expiry_status };
};

const getAllLots = async (req, res) => {
    try {
        const query = parseListQuery(req.query);
        const lots = await lotService.getAllLots(query);
        return sendListResponse(res, 200, "List all lots success", lots);
    } catch (error) {
        return sendResponse(res, 500, error.message || "Internal Server Error");
    }
}

const getLotById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return sendResponse(res, 400, "Invalid lot id");
        }
        const lot = await lotService.getLotById(id);
        if (!lot) {
            return sendResponse(res, 404, "Lot not found");
        }

        return sendResponse(res, 200, "Get lot by ID success", lot);
    } catch (error) {
        return sendResponse(res, 500, error.message || "Internal Server Error");
    }
};

const adjustLotStock = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.body;
        if (!id) {
            return res.status(400).json({ success: false, message: "Invalid lot code" });
        }
        const result = await lotService.adjustLotStock(id, payload, req.user || {});

        req.io.emit('REFRESH_DATA', 'LOTS');
        req.io.emit('REFRESH_DATA', 'ITEMS');
        req.io.emit('REFRESH_DATA', 'STOCK_MOVEMENTS');

        return sendResponse(res, 200, "adjust lot stock success", result);
    } catch (error) {
        if (error.message === 'Lot id not found' || error.message === 'Lot not found') {
            return sendResponse(res, 404, error.message);
        }
        return sendResponse(res, 400, error.message || "adjust lot stock failed");
    }
}

const deleteLot = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ success: false, message: "Invalid lot id" });
        }
        const result = await lotService.deleteLot(id, req.user || {});

        req.io.emit('REFRESH_DATA', 'LOTS');
        req.io.emit('REFRESH_DATA', 'ITEMS');
        req.io.emit('REFRESH_DATA', 'STOCK_MOVEMENTS');

        return sendResponse(res, 200, "canceling lot success", result);
    } catch (error) {
        if (error.message === 'Lot id not found') {
            return sendResponse(res, 404, error.message);
        }
        return sendResponse(res, 400, error.message || "canceling lot failed");
    }
}

const toggleStatus = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ success: false, message: "Invalid lot id" });
        }
        const result = await lotService.toggleLotStatus(id, req.user || {});

        req.io.emit('REFRESH_DATA', 'LOTS');
        req.io.emit('REFRESH_DATA', 'ITEMS');
        req.io.emit('REFRESH_DATA', 'STOCK_MOVEMENTS');

        return sendResponse(res, 200, "toggle lot status success", result);
    } catch (error) {
        if (error.message === 'Lot id not found') {
            return sendResponse(res, 404, error.message);
        }
        return sendResponse(res, 400, error.message || "toggle lot status failed");
    }
}

module.exports = {
    getAllLots,
    getLotById,
    adjustLotStock,
    deleteLot,
    toggleStatus,
};