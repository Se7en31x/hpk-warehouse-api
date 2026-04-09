const reusableService = require('../services/reusableItem.service');
const DTO = require('../dtos/reusableItem.dto');
const util = require('../utils/response');

const VALID_STATUSES = ['AVAILABLE', 'IN_USE', 'REPAIR', 'DISPOSED'];
const VALID_CONDITIONS = ['GOOD', 'DAMAGED', 'LOST', 'BROKEN'];

const validateCreateReusableReceive = (data = {}) => {
    if (!data.doc_no || !data.doc_no.toString().trim()) return 'doc_no is required';

    if (!Array.isArray(data.items) || data.items.length === 0) {
        return 'items must be a non-empty array';
    }

    for (let i = 0; i < data.items.length; i += 1) {
        const item = data.items[i];
        if (!item?.item_id) return `items[${i}].item_id is required`;
        if (!Array.isArray(item.units) || item.units.length === 0) {
            return `items[${i}].units must be a non-empty array`;
        }

        for (let j = 0; j < item.units.length; j += 1) {
            const unit = item.units[j];

            if (unit?.status && !VALID_STATUSES.includes(unit.status.toString().trim().toUpperCase())) {
                return `items[${i}].units[${j}].status must be one of: ${VALID_STATUSES.join(', ')}`;
            }

            if (unit?.condition && !VALID_CONDITIONS.includes(unit.condition.toString().trim().toUpperCase())) {
                return `items[${i}].units[${j}].condition must be one of: ${VALID_CONDITIONS.join(', ')}`;
            }
        }
    }

    return null;
};

const createReusableReceive = async (req, res) => {
    try {
        const data = req.body || {};
        const validationMessage = validateCreateReusableReceive(data);
        if (validationMessage) {
            return util.sendResponse(res, 400, validationMessage);
        }

        const result = await reusableService.createReusableReceive(data, req.user || null);

        req.io.emit('REFRESH_DATA', 'RECEIVES');
        req.io.emit('REFRESH_DATA', 'REUSABLE_UNITS');
        req.io.emit('REFRESH_DATA', 'ITEMS');

        return util.sendResponse(res, 201, 'create reusable receive success', result);
    } catch (error) {
        if (error?.code === 'P2002') {
            return util.sendResponse(res, 409, 'doc_no or unit_code already exists');
        }

        return util.sendResponse(res, error?.statusCode || 500, error.message || 'create reusable receive failed');
    }
};

const getReusableUnits = async (req, res) => {
    try {
        const query = DTO.listReusableUnitsQueryDTO(req.query);
        const result = await reusableService.getReusableUnits(query);
        return util.sendListResponse(res, 200, 'list reusable units success', result);
    } catch (error) {
        return util.sendResponse(res, 500, error.message || 'fetch reusable units failed');
    }
};

const getReusableUnitById = async (req, res) => {
    try {
        const result = await reusableService.getReusableUnitById(req.params.id);
        return util.sendResponse(res, 200, 'get reusable unit by id success', result);
    } catch (error) {
        return util.sendResponse(res, error?.statusCode || 500, error.message || 'fetch reusable unit failed');
    }
};

const updateReusableUnit = async (req, res) => {
    try {
        const payload = req.body || {};

        if (Object.prototype.hasOwnProperty.call(payload, 'unit_code')) {
            return util.sendResponse(res, 400, 'unit_code is immutable and cannot be edited');
        }

        if (payload.status && !VALID_STATUSES.includes(payload.status.toString().trim().toUpperCase())) {
            return util.sendResponse(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
        }

        if (payload.condition && !VALID_CONDITIONS.includes(payload.condition.toString().trim().toUpperCase())) {
            return util.sendResponse(res, 400, `condition must be one of: ${VALID_CONDITIONS.join(', ')}`);
        }

        const result = await reusableService.updateReusableUnit(req.params.id, payload, req.user || null);

        req.io.emit('REFRESH_DATA', 'REUSABLE_UNITS');
        req.io.emit('REFRESH_DATA', 'ITEMS');

        return util.sendResponse(res, 200, 'update reusable unit success', result);
    } catch (error) {
        if (error?.code === 'P2002') {
            return util.sendResponse(res, 409, 'unit_code already exists');
        }

        return util.sendResponse(res, error?.statusCode || 500, error.message || 'update reusable unit failed');
    }
};

const returnReusableFromWithdraw = async (req, res) => {
    try {
        const payload = req.body || {};

        const result = await reusableService.returnReusableFromWithdraw(req.params.id, payload, req.user || null);

        req.io.emit('REFRESH_DATA', 'REUSABLE_UNITS');
        req.io.emit('REFRESH_DATA', 'ITEMS');

        return util.sendResponse(res, 200, 'return reusable unit from withdraw success', result);
    } catch (error) {
        return util.sendResponse(res, error?.statusCode || 500, error.message || 'return reusable unit failed');
    }
};

const getReturnableWithdrawSummary = async (req, res) => {
    try {
        const departmentId = req.query.department_id;
        const result = await reusableService.getReturnableWithdrawSummary(departmentId);
        return util.sendResponse(res, 200, 'get returnable withdraw summary success', result);
    } catch (error) {
        return util.sendResponse(res, error?.statusCode || 500, error.message || 'fetch returnable summary failed');
    }
};

const createReturnRequest = async (req, res) => {
    try {
        const payload = req.body || {};
        const result = await reusableService.createReturnRequest(payload, req.user || null);

        req.io.emit('REFRESH_DATA', 'REUSABLE_RETURN_REQUESTS');

        return util.sendResponse(res, 201, 'create reusable return request success', result);
    } catch (error) {
        if (error?.code === 'P2002') {
            return util.sendResponse(res, 409, 'return request doc_no already exists');
        }

        return util.sendResponse(res, error?.statusCode || 500, error.message || 'create return request failed');
    }
};

const getReturnRequests = async (req, res) => {
    try {
        const query = DTO.listReturnRequestsQueryDTO(req.query);
        const result = await reusableService.getReturnRequests(query);
        return util.sendListResponse(res, 200, 'list reusable return requests success', result);
    } catch (error) {
        return util.sendResponse(res, error?.statusCode || 500, error.message || 'fetch return requests failed');
    }
};

const getReturnRequestById = async (req, res) => {
    try {
        const result = await reusableService.getReturnRequestById(req.params.id);
        return util.sendResponse(res, 200, 'get reusable return request by id success', result);
    } catch (error) {
        return util.sendResponse(res, error?.statusCode || 500, error.message || 'fetch return request failed');
    }
};

const processReturnRequest = async (req, res) => {
    try {
        const payload = req.body || {};
        const result = await reusableService.processReturnRequest(req.params.id, payload, req.user || null);

        req.io.emit('REFRESH_DATA', 'REUSABLE_UNITS');
        req.io.emit('REFRESH_DATA', 'REUSABLE_RETURN_REQUESTS');
        req.io.emit('REFRESH_DATA', 'ITEMS');

        return util.sendResponse(res, 200, 'process reusable return request success', result);
    } catch (error) {
        return util.sendResponse(res, error?.statusCode || 500, error.message || 'process return request failed');
    }
};

const deleteReturnRequest = async (req, res) => {
    try {
        const result = await reusableService.deleteReturnRequest(req.params.id);

        req.io.emit('REFRESH_DATA', 'REUSABLE_RETURN_REQUESTS');

        return util.sendResponse(res, 200, 'delete reusable return request success', result);
    } catch (error) {
        return util.sendResponse(res, error?.statusCode || 500, error.message || 'delete return request failed');
    }
};

const resolveBarcode = async (req, res) => {
    try {
        const value = (req.query?.value || req.body?.value || '').toString().trim();
        const departmentId = req.query?.department_id || req.body?.department_id || null;

        if (!value) {
            return util.sendResponse(res, 400, 'value is required');
        }

        const result = await reusableService.resolveBarcode({ value, departmentId });
        if (!result) {
            return util.sendResponse(res, 404, 'barcode not found');
        }

        return util.sendResponse(res, 200, 'resolve barcode success', result);
    } catch (error) {
        return util.sendResponse(res, error?.statusCode || 500, error.message || 'resolve barcode failed');
    }
};

module.exports = {
    createReusableReceive,
    getReusableUnits,
    getReusableUnitById,
    updateReusableUnit,
    returnReusableFromWithdraw,
    getReturnableWithdrawSummary,
    createReturnRequest,
    getReturnRequests,
    getReturnRequestById,
    processReturnRequest,
    deleteReturnRequest,
    resolveBarcode,
};
