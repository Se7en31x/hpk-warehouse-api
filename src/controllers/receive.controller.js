const receiveService = require('../services/receive.service');
const notificationService = require('../services/notification.service');
const { getIO, buildUserRoom } = require('../utils/socket');
const DTO = require('../dtos/receive.dto');
const util = require('../utils/response');

const WAREHOUSE_ROLES = () =>
    (process.env.ROLE_WAREHOUSE_GROUP || '').split(',').map(r => r.trim()).filter(Boolean);

const ACQ_LABEL = { PURCHASE: 'จัดซื้อ', DONATION: 'บริจาค' };

async function sendReceiveNotification(actorId, recipientIds, payload) {
    if (!recipientIds.length) return;
    try {
        const result = await notificationService.createNotificationSafely({ actorId, recipientIds, payload });
        if (!result?.id || result?.deduped) return;
        const io = getIO();
        const notifData = {
            id: result.id, recipient_row_id: null, is_read: false,
            created_at: new Date().toISOString(), delivered_at: new Date().toISOString(), read_at: null,
            ...payload,
        };
        recipientIds.forEach(uid => {
            io.to(buildUserRoom(uid)).emit('REFRESH_DATA', 'NOTIFICATIONS');
            io.to(buildUserRoom(uid)).emit('notification:new', notifData);
        });
    } catch (e) {
        console.error('[receive notification] failed:', e.message);
    }
}

const RECEIVE_STATUSES = {
    PENDING: 'PENDING',
    COMPLETED: 'COMPLETED',
};

// ── Batch ──────────────────────────────────────────────────────────────────────

const validateCreateBatch = (data) => {
    if (!data || typeof data !== 'object') return 'Invalid body data';
    if (!data.batch_no || !data.batch_no.toString().trim()) return 'batch_no is required';
    if (!data.acquisition_type || !data.acquisition_type.toString().trim()) return 'acquisition_type is required';
    return null;
};

const createBatch = async (req, res) => {
    try {
        const data = req.body;
        const validationMessage = validateCreateBatch(data);
        if (validationMessage) {
            return util.sendResponse(res, 400, validationMessage);
        }

        const created = await receiveService.createBatch(data, req.user || null);
        req.io.emit('REFRESH_DATA', 'RECEIVES');
        return util.sendResponse(res, 201, 'create receive batch success', created);
    } catch (error) {
        if (error?.code === 'P2002') {
            return util.sendResponse(res, 409, 'batch_no already exists');
        }
        return util.sendResponse(res, error?.statusCode || 500, error.message || 'create batch failed');
    }
};

const getBatchById = async (req, res) => {
    try {
        const id = Number(req.params.batchId);
        if (!Number.isInteger(id) || id <= 0) {
            return util.sendResponse(res, 400, 'invalid batch id');
        }

        const batch = await receiveService.getBatchById(id);
        return util.sendResponse(res, 200, 'get batch success', batch);
    } catch (error) {
        if (error?.statusCode) {
            return util.sendResponse(res, error.statusCode, error.message);
        }
        return util.sendResponse(res, 500, error.message || 'fetch batch failed');
    }
};

// ── List ───────────────────────────────────────────────────────────────────────

const getReceives = async (req, res) => {
    try {
        const query = DTO.listBatchesQueryDTO(req.query);
        const result = await receiveService.getReceives(query);
        return util.sendListResponse(res, 200, 'list batches success', result);
    } catch (error) {
        return util.sendResponse(res, 500, error.message || 'fetch batches failed');
    }
};

// ── Header ─────────────────────────────────────────────────────────────────────

/** @param {object} data */
const validateCreateReceive = (data) => {
    if (!data || typeof data !== 'object') return 'Invalid body data';
    if (!data.doc_no || !data.doc_no.toString().trim()) return 'doc_no is required';
    if (!data.type || !data.type.toString().trim()) return 'type is required';

    const batchId = Number(data.batch_id);
    if (!Number.isInteger(batchId) || batchId <= 0) return 'batch_id must be a valid integer';

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

        const itemType = (data.type || '').toString().trim().toUpperCase();

        if (normalizedStatus === RECEIVE_STATUSES.COMPLETED) {
            // lot_code ไม่บังคับ — ถ้าไม่ส่งมา service จะ generate ให้อัตโนมัติ
            if (qty > expectedQty) {
                return `items[${i}].qty cannot exceed expected_qty`;
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
            batch_id: Number(req.body?.batch_id),
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
        return util.sendResponse(res, error?.statusCode || 500, error.message || 'create receive failed');
    }
};

// ── Confirm / Cancel ───────────────────────────────────────────────────────────

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

const notifyBatch = async (req, res) => {
    try {
        const batchId = Number(req.params.batchId);
        if (!Number.isInteger(batchId) || batchId <= 0) {
            return util.sendResponse(res, 400, 'invalid batch id');
        }

        const batch = await receiveService.getBatchById(batchId);
        if (!batch) return util.sendResponse(res, 404, 'batch not found');

        // รวม items ทุก header ใน batch (เฉพาะ qty > 0)
        const allItems = (batch.headers || []).flatMap(h => h.receive_item || []);
        const receivedItems = allItems.filter(i => Number(i.qty) > 0);
        const uniqueItemCount = receivedItems.length;
        const totalQty = receivedItems.reduce((sum, i) => sum + Number(i.qty), 0);

        const recorderName = batch.created_by_name || req.user?.email || 'เจ้าหน้าที่';
        const typeLabel = ACQ_LABEL[batch.acquisition_type] || 'จัดซื้อ';

        const recipientIds = await notificationService.getRecipientIdsByRoles(WAREHOUSE_ROLES());
        await sendReceiveNotification(req.user?.sub || null, recipientIds, {
            type: 'STOCK_IN',
            severity: 'INFO',
            title: `รับสินค้าเข้าคลัง: ${batch.batch_no}`,
            body: `โดย ${recorderName} — นำเข้า ${uniqueItemCount} รายการ รวม ${totalQty} ชิ้น (${typeLabel})`,
            entity_type: 'WAREHOUSE',
            entity_id: String(batch.id),
            entity_code: batch.batch_no,
        });

        return util.sendResponse(res, 200, 'notify batch success');
    } catch (error) {
        return util.sendResponse(res, 500, error.message || 'notify batch failed');
    }
};

module.exports = {
    createBatch,
    getBatchById,
    getReceives,
    createReceive,
    cancelReceive,
    confirmReceive,
    notifyBatch,
};
