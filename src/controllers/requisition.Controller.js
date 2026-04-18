const requisitionService = require('../services/requisition.Service');
const notificationService = require('../services/notification.service');
const util = require('../utils/response');
const { getIO, buildUserRoom, buildRoleRoom } = require('../utils/socket');
const { isAdmin, getUserDepartmentIds } = require('../utils/userAccess');

/**
 * @typedef {Object} RequisitionItemInput
 * @property {string} item_id
 * @property {number} qty
 * @property {string=} note
 */

/**
 * @typedef {Object} CreateRequisitionBody
 * @property {string} type - 'WITHDRAW' | 'BORROW'
 * @property {number} department_id - เปลี่ยนจาก string department เป็น number id
 * @property {string|null=} note
 * @property {string|null=} due_date
 * @property {Object|null=} borrower - { fullname, phone, address, ... }
 * @property {RequisitionItemInput[]} items
 */

const REQ_TYPES = {
    WITHDRAW: 'WITHDRAW',
    BORROW: 'BORROW',
};

const parseRoles = (raw = '') => {
    return (raw || '')
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean);
};

const getWarehouseRecipientIds = async () => {
    const roles = parseRoles(process.env.ROLE_WAREHOUSE_GROUP || '');
    if (!roles.length) return [];
    return notificationService.getRecipientIdsByRoles(roles);
};

const emitNotificationRefresh = (recipientIds = []) => {
    try {
        const io = getIO();
        const ids = Array.from(new Set((recipientIds || []).filter(Boolean)));
        if (!ids.length) {
            io.emit('REFRESH_DATA', 'NOTIFICATIONS');
            return;
        }
        ids.forEach((uid) => io.to(buildUserRoom(uid)).emit('REFRESH_DATA', 'NOTIFICATIONS'));
    } catch (e) {
        // Ignore socket refresh failures
    }
};

const emitNotificationNew = (recipientIds = [], roleNames = [], notifData) => {
    try {
        const io = getIO();
        console.log('🚀 Sending Socket Notification to Warehouse Staff:', notifData.title);

        // Emit to individual USER rooms
        const ids = Array.from(new Set((recipientIds || []).filter(Boolean)));
        ids.forEach((uid) => io.to(buildUserRoom(uid)).emit('notification:new', notifData));

        // Also emit to ROLE rooms so users whose IDs weren't resolved still receive it
        const roles = Array.from(new Set((roleNames || []).filter(Boolean)));
        roles.forEach((role) => {
            console.log(`[Socket] Emitting notification:new to ROLE:${role}`);
            io.to(buildRoleRoom(role)).emit('notification:new', notifData);
        });
    } catch (e) {
        console.error('[Socket] emitNotificationNew failed:', e.message);
    }
};

const safeCreateNotification = async ({ actorId, recipientIds = [], roleNames = [], payload }) => {
    const ids = Array.from(new Set((recipientIds || []).filter(Boolean)));

    try {
        // Still create the DB record (requires at least one recipient ID)
        if (ids.length) {
            const created = await notificationService.createNotificationSafely({
                actorId,
                recipientIds: ids,
                payload,
            });
            emitNotificationRefresh(ids);

            if (created?.id && !created?.deduped) {
                const notifData = {
                    id: created.id,
                    recipient_row_id: null,
                    is_read: false,
                    created_at: new Date().toISOString(),
                    delivered_at: new Date().toISOString(),
                    read_at: null,
                    type: payload.type,
                    severity: payload.severity || 'INFO',
                    title: payload.title,
                    body: payload.body || null,
                    entity_type: payload.entity_type || null,
                    entity_id: payload.entity_id ? String(payload.entity_id) : null,
                    entity_code: payload.entity_code || null,
                    metadata: payload.metadata || null,
                    expires_at: payload.expires_at || null,
                };
                emitNotificationNew(ids, roleNames, notifData);
            }
        } else if (roleNames?.length) {
            // No resolved IDs but we have role targets — emit socket only (no DB record)
            const notifData = {
                id: null,
                recipient_row_id: null,
                is_read: false,
                created_at: new Date().toISOString(),
                delivered_at: new Date().toISOString(),
                read_at: null,
                type: payload.type,
                severity: payload.severity || 'INFO',
                title: payload.title,
                body: payload.body || null,
                entity_type: payload.entity_type || null,
                entity_id: payload.entity_id ? String(payload.entity_id) : null,
                entity_code: payload.entity_code || null,
                metadata: payload.metadata || null,
                expires_at: payload.expires_at || null,
            };
            emitNotificationNew([], roleNames, notifData);
        }
    } catch (e) {
        console.error('[Notification] safeCreateNotification failed:', e.message);
    }
};

/** @param {CreateRequisitionBody} data */
const validateCreateRequisition = (data) => {
    if (!data || typeof data !== 'object') return 'Invalid body data';
    if (!data.type || ![REQ_TYPES.WITHDRAW, REQ_TYPES.BORROW].includes(data.type.toUpperCase())) {
        return 'type is required and must be WITHDRAW or BORROW';
    }
    
    // แก้ไข: ตรวจสอบเป็น department_id (Number)
    const deptId = Number(data.department_id);
    if (!deptId || !Number.isInteger(deptId)) return 'department_id is required and must be an integer';

    if (!Array.isArray(data.items) || data.items.length === 0) {
        return 'items must be a non-empty array';
    }

    for (let i = 0; i < data.items.length; i += 1) {
        const item = data.items[i];
        if (!item?.item_id) return `items[${i}].item_id is required`;
        
        const qty = Number(item?.qty);
        if (!Number.isInteger(qty) || qty <= 0) {
            return `items[${i}].qty must be an integer greater than 0`;
        }
    }

    if (data.type === REQ_TYPES.BORROW && !data.borrower) {
        return 'borrower details are required for BORROW type';
    }

    return null;
};

const createRequisition = async (req, res) => {
    try {
        const data = { ...req.body };

        data.requester_id = req.user?.sub ?? null;

        // Access control: non-admin users may only create requisitions for their own departments.
        if (!isAdmin(req.user)) {
            const userDeptIds = getUserDepartmentIds(req.user);
            if (userDeptIds.length > 0 && !userDeptIds.includes(Number(data.department_id))) {
                return util.sendResponse(res, 403, 'ไม่มีสิทธิ์ดำเนินการในนามแผนกนี้');
            }
        }

        const validationMessage = validateCreateRequisition(data);
        if (validationMessage) {
            return util.sendResponse(res, 400, validationMessage);
        }

        // แปลงให้เป็น Number ก่อนส่งเข้า Service
        data.department_id = Number(data.department_id);

        const created = await requisitionService.createRequisition(data, req.user || null);

        const actorId = req.user?.sub || null;
        const warehouseRoles = parseRoles(process.env.ROLE_WAREHOUSE_GROUP || '');
        const allWarehouseRecipients = await getWarehouseRecipientIds();
        // All warehouse staff are recipients — do not exclude the actor, they may be an
        // admin testing from the requester side but still needs the warehouse bell to update.
        const warehouseRecipients = allWarehouseRecipients;
        await safeCreateNotification({
            actorId,
            recipientIds: warehouseRecipients,
            roleNames: warehouseRoles,
            payload: {
                type: 'REQUISITION_CREATED',
                severity: 'INFO',
                title: `มีคำขอใหม่: ${created?.doc_no || '-'}`,
                body: `จากแผนก ${created?.department_name || '-'} (${created?.type === 'BORROW' ? 'ยืม' : 'เบิก'})`,
                entity_type: 'WAREHOUSE',
                entity_id: String(created?.id || ''),
                entity_code: created?.doc_no || null,
                metadata: {
                    requisition_id: created?.id || null,
                    doc_no: created?.doc_no || null,
                    type: created?.type || null,
                },
            },
        });

        req.io.emit('REFRESH_DATA', 'REQUISITIONS');

        return util.sendResponse(res, 201, 'create requisition success', created);
    } catch (error) {
        return util.sendResponse(res, 500, error.message || 'create requisition failed');
    }
};

const getRequisitions = async (req, res) => {
    try {
        const result = await requisitionService.getAllRequisitions(req.query, req.user || null);
        return util.sendListResponse(res, 200, 'list requisitions success', result);
    } catch (error) {
        return util.sendResponse(res, 500, error.message || 'fetch requisitions failed');
    }
};

const getRequisitionById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return util.sendResponse(res, 400, 'invalid requisition id');
        }

        const requisition = await requisitionService.getRequisitionDetail(id);

        return util.sendResponse(res, 200, 'get requisition by id success', requisition);
    } catch (error) {
        if (error?.statusCode) {
            return util.sendResponse(res, error.statusCode, error.message);
        }
        return util.sendResponse(res, 500, error.message || 'fetch requisition failed');
    }
};

const approveRequisition = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const itemsToIssue = req.body?.items; 

        if (!itemsToIssue || typeof itemsToIssue !== 'object') {
            return util.sendResponse(res, 400, 'items to issue are required');
        }

        const result = await requisitionService.approveRequisition(id, itemsToIssue, req.user || null);

        const requesterId = result?.requester_id ? String(result.requester_id) : null;
        if (requesterId) {
            const title = result?.type === REQ_TYPES.WITHDRAW
                ? `คำขออนุมัติแล้ว (รอนำส่ง): ${result?.doc_no || '-'}`
                : `คำขอยืมอนุมัติแล้ว: ${result?.doc_no || '-'}`;

            await safeCreateNotification({
                actorId: req.user?.sub || null,
                recipientIds: [requesterId],
                payload: {
                    type: 'REQUISITION_APPROVED',
                    severity: 'INFO',
                    title,
                    body: result?.type === REQ_TYPES.WITHDRAW ? 'คลังอนุมัติแล้ว กรุณารอรับพัสดุ' : 'คลังอนุมัติการยืมแล้ว',
                    entity_type: 'REQUEST_HISTORY',
                    entity_id: String(result?.id || id),
                    entity_code: result?.doc_no || null,
                },
            });
        }

        req.io.emit('REFRESH_DATA', 'REQUISITIONS');
        req.io.emit('REFRESH_DATA', 'LOTS');
        req.io.emit('REFRESH_DATA', 'ITEMS');
        req.io.emit('REFRESH_DATA', 'STOCK_MOVEMENTS');

        return util.sendResponse(res, 200, 'approve requisition success', result);
    } catch (error) {
        if (error?.statusCode) {
            return util.sendResponse(res, error.statusCode, error.message);
        }
        return util.sendResponse(res, 500, error.message || 'approve requisition failed');
    }
};

const completeDelivery = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return util.sendResponse(res, 400, 'invalid requisition id');
        }

        const result = await requisitionService.completeDelivery(id, req.user || null);

        const requesterId = result?.requester_id ? String(result.requester_id) : null;
        if (requesterId) {
            await safeCreateNotification({
                actorId: req.user?.sub || null,
                recipientIds: [requesterId],
                payload: {
                    type: 'REQUISITION_DELIVERED',
                    severity: 'INFO',
                    title: `นำส่งเรียบร้อย: ${result?.doc_no || '-'}`,
                    body: 'คลังนำส่งพัสดุเรียบร้อยแล้ว',
                    entity_type: 'REQUEST_HISTORY',
                    entity_id: String(result?.id || id),
                    entity_code: result?.doc_no || null,
                },
            });
        }

        req.io.emit('REFRESH_DATA', 'REQUISITIONS');

        return util.sendResponse(res, 200, 'complete delivery success', result);
    } catch (error) {
        if (error?.statusCode) {
            return util.sendResponse(res, error.statusCode, error.message);
        }
        return util.sendResponse(res, 500, error.message || 'complete delivery failed');
    }
};

const rejectRequisition = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const reason = (req.body?.note || '').toString();

        const result = await requisitionService.rejectRequisition(id, reason, req.user || null);

        const requesterId = result?.requester_id ? String(result.requester_id) : null;
        if (requesterId) {
            await safeCreateNotification({
                actorId: req.user?.sub || null,
                recipientIds: [requesterId],
                payload: {
                    type: 'REQUISITION_REJECTED',
                    severity: 'WARNING',
                    title: `คำขอถูกปฏิเสธ: ${result?.doc_no || '-'}`,
                    body: reason ? `เหตุผล: ${reason}` : 'กรุณาตรวจสอบรายละเอียดกับเจ้าหน้าที่คลัง',
                    entity_type: 'REQUEST_HISTORY',
                    entity_id: String(result?.id || id),
                    entity_code: result?.doc_no || null,
                },
            });
        }

        req.io.emit('REFRESH_DATA', 'REQUISITIONS');

        return util.sendResponse(res, 200, 'reject requisition success', result);
    } catch (error) {
        if (error?.statusCode) {
            return util.sendResponse(res, error.statusCode, error.message);
        }
        return util.sendResponse(res, 500, error.message || 'reject requisition failed');
    }
};

const cancelRequisition = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return util.sendResponse(res, 400, 'invalid requisition id');
        }

        const result = await requisitionService.cancelRequisition(id, req.user || null);

        const cancelActorId = req.user?.sub || null;
        const cancelRoles = parseRoles(process.env.ROLE_WAREHOUSE_GROUP || '');
        const allWarehouseForCancel = await getWarehouseRecipientIds();
        // Skip the person who cancelled — they already know
        const cancelRecipients = allWarehouseForCancel.filter((uid) => uid !== cancelActorId);
        await safeCreateNotification({
            actorId: cancelActorId,
            recipientIds: cancelRecipients,
            roleNames: cancelRoles,
            payload: {
                type: 'REQUISITION_CANCELLED',
                severity: 'INFO',
                title: `คำขอถูกยกเลิก: ${result?.doc_no || result?.id || id}`,
                body: 'รายการคำขอถูกยกเลิกโดยผู้ใช้งาน',
                entity_type: 'WAREHOUSE',
                entity_id: String(result?.id || id),
                entity_code: result?.doc_no || null,
            },
        });

        req.io.emit('REFRESH_DATA', 'REQUISITIONS');

        return util.sendResponse(res, 200, 'cancel requisition success', result);
    } catch (error) {
        if (error?.statusCode) {
            return util.sendResponse(res, error.statusCode, error.message);
        }
        return util.sendResponse(res, 500, error.message || 'cancel requisition failed');
    }
};

const getActiveBorrows = async (req, res) => {
    try {
        const items = await requisitionService.getActiveBorrows();
        return util.sendListResponse(res, 200, 'active borrows success', {
            items,
            total: items.length,
            page: 1,
            limit: items.length,
        });
    } catch (error) {
        return util.sendResponse(res, 500, error.message || 'fetch active borrows failed');
    }
};

const processReturn = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return util.sendResponse(res, 400, 'invalid borrow id');
        }

        const returnItems = req.body?.items;
        if (!Array.isArray(returnItems) || returnItems.length === 0) {
            return util.sendResponse(res, 400, 'items must be a non-empty array');
        }

        for (let i = 0; i < returnItems.length; i++) {
            const item = returnItems[i];
            if (!item?.req_item_id) {
                return util.sendResponse(res, 400, `items[${i}].req_item_id is required`);
            }
            const qty = Number(item?.qty_returned);
            if (!Number.isInteger(qty) || qty <= 0) {
                return util.sendResponse(res, 400, `items[${i}].qty_returned must be a positive integer`);
            }
        }

        const result = await requisitionService.processReturn(id, returnItems, req.user || null);

        const requesterId = result?.requester_id ? String(result.requester_id) : null;
        if (requesterId) {
            await safeCreateNotification({
                actorId: req.user?.sub || null,
                recipientIds: [requesterId],
                payload: {
                    type: 'BORROW_RETURN_UPDATED',
                    severity: 'INFO',
                    title: `อัปเดตการคืน: ${result?.doc_no || '-'}`,
                    body: result?.status === 'COMPLETED' ? 'รับคืนครบและปิดงานแล้ว' : 'มีการบันทึกรับคืนบางส่วน',
                    entity_type: 'REQUEST_HISTORY',
                    entity_id: String(result?.id || id),
                    entity_code: result?.doc_no || null,
                },
            });
        }

        req.io.emit('REFRESH_DATA', 'REQUISITIONS');
        req.io.emit('REFRESH_DATA', 'LOTS');
        req.io.emit('REFRESH_DATA', 'ITEMS');
        req.io.emit('REFRESH_DATA', 'STOCK_MOVEMENTS');

        return util.sendResponse(res, 200, 'process return success', result);
    } catch (error) {
        if (error?.statusCode) {
            return util.sendResponse(res, error.statusCode, error.message);
        }
        return util.sendResponse(res, 500, error.message || 'process return failed');
    }
};

module.exports = {
    createRequisition,
    getRequisitions,
    getRequisitionById,
    approveRequisition,
    completeDelivery,
    rejectRequisition,
    cancelRequisition,
    getActiveBorrows,
    processReturn,
};