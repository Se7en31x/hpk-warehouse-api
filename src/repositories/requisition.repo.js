const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// --- Helper: Search Filter ---
const buildRequisitionWhere = ({ keyword = '', type = '', status = '', start_date = '', end_date = '', department_code = '' } = {}) => {
    const where = {};
    const normalizedKeyword = (keyword || '').trim();
    
    if (type) where.type = type;
    if (status) where.status = status;
    if (department_code) where.department_code = department_code;

    if (normalizedKeyword) {
        where.OR = [
            { doc_no: { contains: normalizedKeyword, mode: 'insensitive' } },
            { note: { contains: normalizedKeyword, mode: 'insensitive' } },
            { department_name: { contains: normalizedKeyword, mode: 'insensitive' } },
        ];
    }

    const startDate = start_date ? new Date(start_date) : null;
    const endDate = end_date ? new Date(end_date) : null;

    if (startDate || endDate) {
        where.request_date = {
            gte: startDate || undefined,
            lte: endDate || undefined,
        };
    }
    return where;
};

// --- Transaction Wrapper ---
const withTransaction = async (callback) => {
    return prisma.$transaction((tx) => callback(tx), {
        timeout: 30000 
    });
};

// --- Header & Items ---
const generateDocNo = async (type, tx = prisma) => {
    const prefix = type === 'WITHDRAW' ? 'REQ' : 'BOR';
    const date = new Date();
    const year = (date.getFullYear() + 543).toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const docPrefix = `${prefix}-${year}${month}-`;

    const lastDoc = await tx.requisition_header.findFirst({
        where: { doc_no: { startsWith: docPrefix } },
        orderBy: { doc_no: 'desc' },
        select: { doc_no: true }
    });

    let runNo = 1;
    if (lastDoc?.doc_no) {
        const lastSequence = lastDoc.doc_no.split('-').pop();
        runNo = parseInt(lastSequence, 10) + 1;
    }
    return `${docPrefix}${runNo.toString().padStart(4, '0')}`;
};

const createHeader = (payload, tx = prisma) => {
    return tx.requisition_header.create({ 
        data: payload 
    });
};

const createItems = (payloads, tx = prisma) => {
    return tx.requisition_item.createMany({ 
        data: payloads 
    });
};

const createAllocation = async (data, tx = prisma) => {
    return tx.item_allocation.create({ data });
};

// --- Borrower & Returns ---
const createBorrowerDetails = async (data, tx = prisma) => {
    return tx.borrower_details.create({ data });
};

const createReturnLog = async (data, tx = prisma) => {
    return tx.return_log.create({ data });
};

const selectItemsForRequisition = async (itemIds = [], tx = prisma) => {
    const normalizedIds = Array.from(new Set((itemIds || []).filter(Boolean)));
    if (!normalizedIds.length) return [];

    return tx.items.findMany({
        where: {
            id: { in: normalizedIds },
            deleted_at: null,
        },
        select: {
            id: true,
            name: true,
            type: true,
            allowed_borrow: true,
            status: true,
        },
    });
};

// --- Queries ---
const SelectRequisitionById = async (id, tx = prisma) => {
    return tx.requisition_header.findUnique({
        where: { id: Number(id) },
        include: {
            requisition_item: { 
                include: {
                    items: {
                        include: {
                            _count: {
                                select: {
                                    reusable_item_units: {
                                        where: {
                                            status: 'AVAILABLE',
                                            condition: 'GOOD',
                                            deleted_at: null,
                                        },
                                    },
                                },
                            },
                        },
                    },
                }
            },
            borrower_details: true,
            profiles_requisition_header_requester_idToprofiles: true
        }
    });
};

const SelectAllRequisitions = async ({ page = 1, limit = 10, keyword = '', type = '', status = '', start_date = '', end_date = '' } = {}) => {
    const where = buildRequisitionWhere({ keyword, type, status, start_date, end_date });
    const skip = (page - 1) * limit;

    const [items, total] = await prisma.$transaction([
        prisma.requisition_header.findMany({
            where,
            include: {
                _count: {
                    select: { requisition_item: true }
                },
                profiles_requisition_header_requester_idToprofiles: {
                    select: { firstname_th: true, lastname_th: true }
                },
                borrower_details: true
            },
            orderBy: { request_date: 'desc' },
            skip,
            take: limit,
        }),
        prisma.requisition_header.count({ where }),
    ]);

    return { items, total, page, limit };
};

const createLogTransaction = async (logData, tx = prisma) => {
    return tx.logs_transaction.create({ 
        data: logData 
    });
};

// --- Stock Operations ---
const getItemLots = async (itemId, tx = prisma) => {
    return tx.item_lots.findMany({
        where: {
            item_id: itemId,
            quantity: { gt: 0 },
            status: 'ACTIVE',
            deleted_at: null,
        },
        orderBy: [
            { expired_at: 'asc' }, // FEFO: หมดอายุก่อน จ่ายก่อน
            { created_at: 'asc' },
        ],
    });
};

const selectAvailableReusableUnitsByItem = async (itemId, qty, tx = prisma) => {
    return tx.reusable_item_units.findMany({
        where: {
            item_id: itemId,
            status: 'AVAILABLE',
            condition: 'GOOD',
            deleted_at: null,
        },
        orderBy: [{ created_at: 'asc' }, { unit_code: 'asc' }],
        take: Number(qty),
    });
};

const updateReusableUnitStatus = async (id, data, tx = prisma) => {
    return tx.reusable_item_units.update({
        where: { id },
        data,
    });
};

const createReusableUnitLog = async (data, tx = prisma) => {
    return tx.reusable_item_unit_logs.create({ data });
};

const selectIssuedReusableUnitsForDocItem = async ({ itemId, docNo, reqItemId, issueAction = 'ISSUE_BORROW_REUSABLE', limit }, tx = prisma) => {
    return tx.reusable_item_units.findMany({
        where: {
            item_id: itemId,
            status: 'IN_USE',
            deleted_at: null,
            movement_logs: {
                some: {
                    action: issueAction,
                    ref_doc_no: docNo,
                    note: { contains: `REQ_ITEM:${reqItemId}` },
                },
            },
        },
        orderBy: [{ updated_at: 'asc' }, { created_at: 'asc' }],
        take: Number(limit),
    });
};


const updateRequisitionItem = async (id, data, tx = prisma) => {
    return tx.requisition_item.update({
        where: { id: Number(id) },
        data,
    });
};

const updateHeaderStatus = async (id, status, approverId, tx = prisma, extraData = {}) => {
    return tx.requisition_header.update({
        where: { id: Number(id) },
        data: {
            status,
            approver_id: approverId || undefined,
            updated_at: new Date(),
            ...extraData,
        },
    });
};

// --- Return Management ---
const SelectAllocationsForReqItem = async (reqItemId, tx = prisma) => {
    return tx.item_allocation.findMany({
        where: { req_item_id: Number(reqItemId) },
        select: { lot_id: true, qty: true },
    });
};

const incrementLotQuantity = async (lotId, qty, tx = prisma) => {
    if (!lotId) return null;
    return tx.item_lots.update({
        where: { id: lotId },
        data: { quantity: { increment: qty } },
    });
};

const softDeleteHeader = async (id, tx = prisma) => {
    return tx.requisition_header.update({
        where: { id: Number(id) },
        data: {
            status: 'CANCELLED',
            updated_at: new Date(),
        },
    });
};

// รายการยืมที่อยู่ระหว่างดำเนินการ (BORROW + BORROWING) — สำหรับหน้าคืนรายการ
const SelectActiveBorrows = async () => {
    return prisma.requisition_header.findMany({
        where: {
            type: 'BORROW',
            status: 'BORROWING',
        },
        include: {
            _count: { select: { requisition_item: true } },
            profiles_requisition_header_requester_idToprofiles: {
                select: { firstname_th: true, lastname_th: true }
            },
            borrower_details: true,
        },
        orderBy: { due_date: 'asc' }, // ค้างคืนมากที่สุดขึ้นก่อน
    });
};

module.exports = {
    withTransaction,
    generateDocNo,
    createHeader,
    createItems,
    createAllocation,
    createBorrowerDetails,
    createReturnLog,
    selectItemsForRequisition,
    SelectRequisitionById,
    SelectAllRequisitions,
    createLogTransaction,
    getItemLots,
    selectAvailableReusableUnitsByItem,
    updateReusableUnitStatus,
    createReusableUnitLog,
    selectIssuedReusableUnitsForDocItem,
    updateRequisitionItem,
    updateHeaderStatus,
    softDeleteHeader,
    SelectActiveBorrows,
    SelectAllocationsForReqItem,
    incrementLotQuantity,
};