const receiveService = require('../services/receive.service');
const DTO = require('../dtos/receive.dto');
const util = require('../utils/response');

/**
 * @typedef {Object} ReceiveItemInput
 * @property {string} item_id
 * @property {number} expected_qty
 * @property {string=} lot_code
 * @property {number} qty
 * @property {number|string=} cost_price
 * @property {string|null=} expired_at
 * @property {string|null=} warehouse_id
 */

/**
 * @typedef {Object} CreateReceiveBody
 * @property {string} doc_no
 * @property {string} type
 * @property {string|null=} supplier_id
 * @property {string|null=} donor_name
 * @property {string|null=} receive_date
 * @property {string|null=} note
 * @property {string} status
 * @property {ReceiveItemInput[]} items
 */

const parseListQuery = (query) => {
    return DTO.listReceivesQueryDTO(query);
};

const RECEIVE_STATUSES = {
    PENDING: 'PENDING',
    COMPLETED: 'COMPLETED',
};

/** @param {CreateReceiveBody} data */
const validateCreateReceive = (data) => {
    if (!data || typeof data !== 'object') return 'Invalid body data';
    if (!data.doc_no || !data.doc_no.toString().trim()) return 'doc_no is required';
    if (!data.type || !data.type.toString().trim()) return 'type is required';

    const normalizedStatus = (data.status || '').toString().trim().toUpperCase();
    if (!normalizedStatus) return 'status is required';
    if (![RECEIVE_STATUSES.PENDING, RECEIVE_STATUSES.COMPLETED].includes(normalizedStatus)) {
        return 'status must be PENDING or COMPLETED';
    }

    if (!Array.isArray(data.items) || data.items.length === 0) {
        return 'items must be a non-empty array';
    }

    for (let i = 0; i < data.items.length; i += 1) {
        const item = data.items[i];
        if (!item?.item_id) return `items[${i}].item_id is required`;

        const expectedQty = Number(item?.expected_qty);
        const qty = Number(item?.qty);

        if (!Number.isInteger(expectedQty) || expectedQty <= 0) {
            return `items[${i}].expected_qty must be an integer greater than 0`;
        }

        if (!Number.isInteger(qty) || qty < 0) {
            return `items[${i}].qty must be an integer greater than or equal to 0`;
        }

        if (normalizedStatus === RECEIVE_STATUSES.PENDING) {
            if (qty !== 0) {
                return `items[${i}].qty must be 0 when status is PENDING`;
            }
        }

        if (normalizedStatus === RECEIVE_STATUSES.COMPLETED) {
            if (!item?.lot_code || !item.lot_code.toString().trim()) {
                return `items[${i}].lot_code is required when status is COMPLETED`;
            }

            if (qty !== expectedQty) {
                return `items[${i}].qty must be equal to expected_qty when status is COMPLETED`;
            }
        }
    }

    return null;
};

const createReceive = async (req, res) => {
    try {
        const data = {
            ...req.body,
            status: (req.body?.status || '').toString().trim().toUpperCase(),
        };
        const validationMessage = validateCreateReceive(data);
        if (validationMessage) {
            return util.sendResponse(res, 400, validationMessage);
        }

        const created = await receiveService.createReceive(data, req.user || null);

        req.io.emit('REFRESH_DATA', 'RECEIVES');
        if (created?.status === RECEIVE_STATUSES.COMPLETED) {
            req.io.emit('REFRESH_DATA', 'LOTS');
            req.io.emit('REFRESH_DATA', 'ITEMS');
            req.io.emit('REFRESH_DATA', 'STOCK_MOVEMENTS');
        }

        return util.sendResponse(res, 201, 'create receive success', created);
    } catch (error) {
        if (error?.code === 'P2002') {
            return util.sendResponse(res, 409, 'doc_no already exists');
        }

        return util.sendResponse(res, 500, error.message || 'create receive failed');
    }
};

const getReceives = async (req, res) => {
    try {
        const query = parseListQuery(req.query);
        const result = await receiveService.getReceives(query);
        return util.sendListResponse(res, 200, 'list receives success', result);
    } catch (error) {
        return util.sendResponse(res, 500, error.message || 'fetch receives failed');
    }
};

const getReceiveById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return util.sendResponse(res, 400, 'invalid receive id');
        }

        const receive = await receiveService.getReceiveById(id);
        return util.sendResponse(res, 200, 'get receive by id success', receive);
    } catch (error) {
        if (error?.statusCode) {
            return util.sendResponse(res, error.statusCode, error.message);
        }

        return util.sendResponse(res, 500, error.message || 'fetch receive by id failed');
    }
};

const cancelReceive = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return util.sendResponse(res, 400, 'invalid receive id');
        }

        const reason = (req.body?.reason || '').toString();
        const cancelled = await receiveService.cancelReceive(id, req.user || null, reason);

        req.io.emit('REFRESH_DATA', 'LOTS');
        req.io.emit('REFRESH_DATA', 'ITEMS');
        req.io.emit('REFRESH_DATA', 'RECEIVES');
        req.io.emit('REFRESH_DATA', 'STOCK_MOVEMENTS');

        return util.sendResponse(res, 200, 'cancel receive success', cancelled);
    } catch (error) {
        if (error?.statusCode) {
            return util.sendResponse(res, error.statusCode, error.message);
        }

        return util.sendResponse(res, 500, error.message || 'cancel receive failed');
    }
};

const confirmReceive = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return util.sendResponse(res, 400, 'invalid receive id');
        }

        const items = req.body?.items;
        if (!Array.isArray(items) || items.length === 0) {
            return util.sendResponse(res, 400, 'items must be a non-empty array');
        }

        const confirmed = await receiveService.confirmReceive(id, items, req.user || null);

        req.io.emit('REFRESH_DATA', 'RECEIVES');
        req.io.emit('REFRESH_DATA', 'LOTS');
        req.io.emit('REFRESH_DATA', 'ITEMS');
        req.io.emit('REFRESH_DATA', 'STOCK_MOVEMENTS');

        return util.sendResponse(res, 200, 'confirm receive success', confirmed);
    } catch (error) {
        if (error?.statusCode) {
            return util.sendResponse(res, error.statusCode, error.message);
        }

        return util.sendResponse(res, 500, error.message || 'confirm receive failed');
    }
};

module.exports = {
    createReceive,
    getReceives,
    getReceiveById,
    cancelReceive,
    confirmReceive,
};
