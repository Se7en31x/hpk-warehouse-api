const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// --- Helper: Search Filter ---
/**
 * Builds a Prisma `where` clause for requisition queries.
 * Uses AND-of-ORs to combine keyword search with access-control conditions cleanly.
 *
 * @param {object} opts
 * @param {string}   opts.keyword
 * @param {string}   opts.type
 * @param {string}   opts.status
 * @param {string}   opts.start_date
 * @param {string}   opts.end_date
 * @param {number|null} opts.department_id  — explicit single-dept filter (admin override)
 * @param {string|null} opts.requester_id   — non-admin: filter to own records
 * @param {number[]}    opts.department_ids — non-admin: user's allowed dept IDs
 */
const buildRequisitionWhere = ({
    keyword = '',
    type = '',
    status = '',
    start_date = '',
    end_date = '',
    department_id = null,
    requester_id = null,
    department_ids = [],
} = {}) => {
    // We collect top-level AND conditions so keyword + access-control compose cleanly
    const andConditions = [];
    const normalizedKeyword = (keyword || '').trim();

    // Simple equality filters
    if (type)   andConditions.push({ type });
    if (status) andConditions.push({ status });

    // Explicit department filter (takes precedence over role-based dept list)
    if (department_id) {
        andConditions.push({ department_id: Number(department_id) });
    }

    // Keyword full-text search (OR across multiple fields)
    if (normalizedKeyword) {
        andConditions.push({
            OR: [
                { doc_no:  { contains: normalizedKeyword, mode: 'insensitive' } },
                { note:    { contains: normalizedKeyword, mode: 'insensitive' } },
                { departments: { name: { contains: normalizedKeyword, mode: 'insensitive' } } },
            ],
        });
    }

    // Date range
    const startDate = start_date ? new Date(start_date) : null;
    const endDate   = end_date   ? new Date(end_date)   : null;
    if (startDate || endDate) {
        andConditions.push({
            request_date: {
                ...(startDate && { gte: startDate }),
                ...(endDate   && { lte: endDate }),
            },
        });
    }

    // Role-based access control: non-admin users see own records OR their department records.
    // Only applied when no explicit department_id override is in effect.
    if (!department_id && (requester_id || department_ids.length > 0)) {
        const accessOr = [];
        if (requester_id)          accessOr.push({ requester_id });
        if (department_ids.length) accessOr.push({ department_id: { in: department_ids } });
        andConditions.push({ OR: accessOr });
    }

    return andConditions.length ? { AND: andConditions } : {};
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
    // payload ควรมี department_id เป็น Number
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

const getBorrowerById = async (id) => {
    return prisma.borrower_details.findUnique({ where: { id } });
};

const updateBorrowerDocument = async (id, data) => {
    return prisma.borrower_details.update({ where: { id }, data });
};

const selectLatestReturnSubmissionLog = async (docNo, tx = prisma) => {
    const code = (docNo || '').toString();
    if (!code) return null;
    return tx.logs_transaction.findFirst({
        where: {
            module: 'WAREHOUSE',
            action: 'SUBMIT_RETURN',
            code,
        },
        orderBy: { created_at: 'desc' },
        select: {
            id: true,
            action: true,
            code: true,
            description: true,
            created_at: true,
            created_by: true,
            created_by_id: true,
        },
    });
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
            // Join ข้อมูลแผนก
            departments: true, 
            requisition_item: {
                include: {
                    items: {
                        include: {
                            categories: { select: { name: true } },
                            unit: { select: { name: true } },
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
                    item_allocation: {
                        include: {
                            item_lot: {
                                select: { lot_code: true, expired_at: true }
                            }
                        }
                    },
                }
            },
            borrower_details: {
                include: {
                    lookup_titles: {
                        select: { short_name: true, name: true }
                    }
                }
            },
            profiles_requisition_header_requester_idToprofiles: {
                select: { firstname_th: true, lastname_th: true }
            },
            profiles_requisition_header_approver_idToprofiles: {
                select: { firstname_th: true, lastname_th: true }
            },
        }
    });
};

const SelectAllRequisitions = async ({
    page = 1,
    limit = 10,
    keyword = '',
    type = '',
    status = '',
    start_date = '',
    end_date = '',
    department_id = null,
    requester_id = null,
    department_ids = [],
} = {}) => {
    const where = buildRequisitionWhere({ keyword, type, status, start_date, end_date, department_id, requester_id, department_ids });
    const skip = (page - 1) * limit;

    const [items, total] = await prisma.$transaction([
        prisma.requisition_header.findMany({
            where,
            include: {
                // Join เอาชื่อแผนกมาแสดงผล
                departments: {
                    select: { name: true, code: true }
                },
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
    const now = new Date();
    return tx.item_lots.findMany({
        where: {
            item_id: itemId,
            quantity: { gt: 0 },
            status: 'ACTIVE',
            deleted_at: null,
            // ไม่รวมล็อตที่หมดอายุแล้ว (ยังรวมล็อตที่ไม่กำหนดวันหมดอายุ: expired_at = null)
            NOT: {
                AND: [
                    { expired_at: { not: null } },
                    { expired_at: { lt: now } },
                ],
            },
        },
        orderBy: [
            { expired_at: 'asc' }, 
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

// --- Traceability ---
/**
 * ดึง log การจ่ายครุภัณฑ์ (REUSABLE) ของ req_item หนึ่งๆ พร้อม unit_code และ serial_no
 * ใช้สำหรับแสดงว่าจ่ายของรหัสไหนออกไปบ้าง
 */
const getIssuedReusableUnitsForReqItem = async (reqItemId, docNo, tx = prisma) => {
    return (tx || prisma).reusable_item_unit_logs.findMany({
        where: {
            ref_doc_no: docNo,
            note: { contains: `REQ_ITEM:${reqItemId}` },
            action: { in: ['ISSUE_BORROW_REUSABLE', 'ISSUE_WITHDRAW_REUSABLE'] },
        },
        include: {
            reusable_item_unit: {
                select: { unit_code: true, serial_no: true }
            }
        },
        orderBy: { created_at: 'asc' },
    });
};

const selectOutstandingReusableUnitsForDocItem = async ({ itemId, docNo, reqItemId }, tx = prisma) => {
    return (tx || prisma).reusable_item_units.findMany({
        where: {
            item_id: itemId,
            status: 'IN_USE',
            deleted_at: null,
            movement_logs: {
                some: {
                    action: { in: ['ISSUE_BORROW_REUSABLE', 'ISSUE_WITHDRAW_REUSABLE'] },
                    ref_doc_no: docNo,
                    note: { contains: `REQ_ITEM:${reqItemId}` },
                },
            },
        },
        select: { id: true, unit_code: true, serial_no: true },
        orderBy: [{ updated_at: 'asc' }, { created_at: 'asc' }],
    });
};

// --- Return Management ---
const SelectAllocationsForReqItem = async (reqItemId, tx = prisma) => {
    return tx.item_allocation.findMany({
        where: { req_item_id: Number(reqItemId) },
        select: {
            lot_id: true,
            qty: true,
            item_lots: { select: { lot_code: true } },
        },
    });
};

const incrementLotQuantity = async (lotId, qty, tx = prisma) => {
    if (!lotId) return null;
    const row = await tx.item_lots.update({
        where: { id: lotId },
        data: { quantity: { increment: qty } },
        select: { id: true, quantity: true, status: true },
    });
    if (row && Number(row.quantity) > 0 && row.status === 'DEPLETED') {
        await tx.item_lots.update({
            where: { id: lotId },
            data: { status: 'ACTIVE', updated_at: new Date() },
        });
    }
    return row;
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

const SelectActiveBorrows = async () => {
    return prisma.requisition_header.findMany({
        where: {
            type: 'BORROW',
            status: { in: ['BORROWING', 'PENDING_RETURN_CHECK'] },
        },
        include: {
            // Join แผนกในหน้ารายการค้างคืน
            departments: {
                select: { name: true }
            },
            _count: { select: { requisition_item: true } },
            profiles_requisition_header_requester_idToprofiles: {
                select: { firstname_th: true, lastname_th: true }
            },
            borrower_details: true,
        },
        orderBy: { due_date: 'asc' }, 
    });
};

module.exports = {
    withTransaction,
    generateDocNo,
    createHeader,
    createItems,
    createAllocation,
    createBorrowerDetails,
    getBorrowerById,
    updateBorrowerDocument,
    selectLatestReturnSubmissionLog,
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
    getIssuedReusableUnitsForReqItem,
    selectOutstandingReusableUnitsForDocItem,
};