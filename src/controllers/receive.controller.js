const receiveService = require('../services/receive.service');
const notificationService = require('../services/notification.service')
const DTO = require('../dtos/receive.dto');
const util = require('../utils/response');

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

        // --- Notification Logic (ใช้ Pattern เดียวกับ createItem) ---
        try {
            const warehouseRoles = (process.env.ROLE_WAREHOUSE_GROUP || 'WAREHOUSE,ADMIN').split(',').map(r => r.trim());
            const recipientIds = await notificationService.getRecipientIdsByRoles(warehouseRoles);

            if (recipientIds.length > 0) {
                // 1. สร้างแจ้งเตือนลงฐานข้อมูล
                const notifyResult = await notificationService.createNotificationSafely({
                    actorId: req.user?.id || null,
                    recipientIds,
                    payload: {
                        type: 'RECEIVE_BATCH',
                        severity: 'INFO',
                        title: '📦 มีพัสดุรับเข้าใหม่',
                        body: `Batch: ${created.batch_no} โดย ${req.user?.name || 'เจ้าหน้าที่'} (${data.donor_name || 'จัดซื้อ'})`,
                        entity_type: 'WAREHOUSE',
                        entity_id: String(created.id),
                        entity_code: created.batch_no,
                        metadata: { batch_id: created.id }
                    }
                });

                // 2. ส่ง Socket แยกรายคน (เพื่อให้เลขกระดิ่งหน้าบ้านเด้ง)
                if (notifyResult && !notifyResult.deduped) {
                    const actualRecipients = notifyResult.recipient_ids || recipientIds;
                    actualRecipients.forEach((uid) => {
                        // ใช้ฟังก์ชัน buildUserRoom (เช็คดูว่าพี่ประกาศไว้ที่ไหนนะครับ ปกติจะอยู่ใน util หรือ controller)
                        const room = `user:${uid}`;
                        req.io.emit('REFRESH_DATA', 'NOTIFICATIONS');

                        // ส่งข้อมูลแจ้งเตือนใหม่ไปให้หน้าบ้านด้วย เพื่อให้ Toast ทำงาน
                        req.io.to(room).emit('notification:new', {
                            id: notifyResult.id || Date.now(),
                            title: '📦 มีพัสดุรับเข้าใหม่',
                            body: created.batch_no,
                            type: 'RECEIVE_BATCH',      
                            severity: 'INFO',           
                            entity_type: 'WAREHOUSE',
                            is_read: false,
                            created_at: new Date().toISOString()
                        });
                    });
                }
            }
        } catch (notifErr) {
            console.error('[createBatch] Notification failed:', notifErr.message);
        }
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
            if (itemType !== 'PURCHASE_ASSET') {
                if (!item?.lot_code || !item.lot_code.toString().trim()) {
                    return `items[${i}].lot_code is required when status is COMPLETED`;
                }
            }

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

module.exports = {
    createBatch,
    getBatchById,
    getReceives,
    createReceive,
    cancelReceive,
    confirmReceive,
};
