const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const unitInclude = {
    items: { select: { id: true, code: true, name: true } },
    // Join ข้อมูลแผนก
    departments: { select: { id: true, name: true } },
    movement_logs: {
        where: {
            action: { in: ['ISSUE_BORROW_REUSABLE', 'ISSUE_WITHDRAW_REUSABLE', 'ISSUE_REUSABLE'] },
        },
        select: {
            action: true,
            created_at: true,
            ref_doc_no: true,
        },
        orderBy: { created_at: 'desc' },
        take: 1,
    },
    receive_item: {
        select: {
            id: true,
            receive_header: { select: { id: true, doc_no: true, receive_batch: { select: { receive_date: true } } } },
        },
    },
};

const returnRequestInclude = {
    departments: { select: { id: true, name: true } },
    profiles: {
        select: {
            id: true,
            firstname_th: true,
            lastname_th: true,
            firstname_en: true,
            lastname_en: true,
        },
    },
    request_items: {
        select: {
            id: true,
            item_id: true,
            requested_qty: true,
            note: true,
            items: {
                select: {
                    id: true,
                    code: true,
                    name: true,
                    categories: { select: { name: true } },
                },
            },
        },
        orderBy: [{ id: 'asc' }],
    },
};

const withTransaction = async (callback) => {
    return prisma.$transaction((tx) => callback(tx), {
        timeout: 30000,
    });
};

const createReceiveHeader = async (data, tx = prisma) => {
    return tx.receive_header.create({ data });
};

const createReceiveItems = async (data, tx = prisma) => {
    return tx.receive_item.createMany({ data });
};

const selectReceiveItemsByHeader = async (headerId, tx = prisma) => {
    return tx.receive_item.findMany({
        where: { header_id: Number(headerId) },
        select: { id: true, item_id: true },
    });
};

const countUnitsByYear = async (year, tx = prisma) => {
    return tx.reusable_item_units.count({
        where: { unit_code: { startsWith: `RUI-${year}` } },
    });
};

const createReusableUnits = async (data, tx = prisma) => {
    return tx.reusable_item_units.createMany({ data });
};

/**
 * @param {object} opts
 * @param {number}      opts.page
 * @param {number}      opts.limit
 * @param {string}      opts.keyword
 * @param {string}      opts.item_id
 * @param {number|null} opts.department_id   — exact dept filter
 * @param {number[]}    opts.department_ids  — non-admin IN filter
 * @param {string}      opts.status
 */
const selectReusableUnits = async ({
    page = 1,
    limit = 10,
    keyword = '',
    item_id = '',
    department_id = null,
    department_ids = [],
    status = '',
} = {}) => {
    const where = {
        deleted_at: null,
    };

    if (item_id) where.item_id = item_id;
    if (status)  where.status  = status;

    // Department filtering: exact takes precedence over list
    if (department_id) {
        where.department_id = Number(department_id);
    } else if (department_ids.length > 0) {
        where.department_id = { in: department_ids };
    }

    if (keyword) {
        where.OR = [
            { unit_code:   { contains: keyword, mode: 'insensitive' } },
            { serial_no:   { contains: keyword, mode: 'insensitive' } },
            { items:       { name: { contains: keyword, mode: 'insensitive' } } },
            { departments: { name: { contains: keyword, mode: 'insensitive' } } },
        ];
    }

    return prisma.$transaction([
        prisma.reusable_item_units.findMany({
            where,
            include: unitInclude,
            orderBy: [{ created_at: 'desc' }, { unit_code: 'asc' }],
            skip: (page - 1) * Number(limit),
            take: Number(limit),
        }),
        prisma.reusable_item_units.count({ where }),
    ]);
};

const countTotalUnitsByItemId = async (itemId, tx = prisma) => {
    return await tx.reusable_item_units.count({
        where: {
            item_id: itemId,
            status: { 
                notIn: ['CANCELLED', 'DISPOSED'] 
            }
        }
    });
};

const selectReusableUnitById = async (id, tx = prisma) => {
    return tx.reusable_item_units.findUnique({
        where: { id },
        include: unitInclude,
    });
};

const updateReusableUnit = async (id, data, tx = prisma) => {
    const updateData = { ...data };
    if (updateData.department_id) updateData.department_id = Number(updateData.department_id);

    return tx.reusable_item_units.update({
        where: { id },
        data: updateData,
        include: unitInclude,
    });
};

const createReusableUnitLog = async (data, tx = prisma) => {
    return tx.reusable_item_unit_logs.create({ data });
};

const selectInUseUnitsByDepartment = async (departmentId, tx = prisma) => {
    return tx.reusable_item_units.findMany({
        where: {
            // ลบ String() ออก
            department_id: Number(departmentId),
            status: 'IN_USE',
            deleted_at: null,
        },
        select: {
            id: true,
            item_id: true,
            unit_code: true,
            serial_no: true,
            status: true,
            movement_logs: {
                where: {
                    action: { in: ['ISSUE_BORROW_REUSABLE', 'ISSUE_WITHDRAW_REUSABLE', 'ISSUE_REUSABLE'] },
                },
                select: {
                    action: true,
                    ref_doc_no: true,
                    created_at: true,
                },
                orderBy: { created_at: 'desc' },
                take: 1,
            },
            items: {
                select: {
                    id: true,
                    code: true,
                    name: true,
                    categories: {
                        select: {
                            name: true,
                        },
                    },
                },
            },
        },
        orderBy: [{ item_id: 'asc' }, { unit_code: 'asc' }],
    });
};

const countReturnRequestsByYear = async (year, tx = prisma) => {
    return tx.reusable_return_requests.count({
        where: {
            doc_no: { startsWith: `RTR-${year}` },
        },
    });
};

const createReturnRequestHeader = async (data, tx = prisma) => {
    return tx.reusable_return_requests.create({
        data: {
            ...data,
            department_id: Number(data.department_id)
        },
    });
};

const createReturnRequestItems = async (data, tx = prisma) => {
    return tx.reusable_return_request_items.createMany({ data });
};

const selectReturnRequestById = async (id, tx = prisma) => {
    return tx.reusable_return_requests.findUnique({
        where: { id: Number(id) },
        include: returnRequestInclude,
    });
};

/**
 * @param {object} opts
 * @param {number}      opts.page
 * @param {number}      opts.limit
 * @param {number|null} opts.department_id   — exact dept filter
 * @param {number[]}    opts.department_ids  — non-admin IN filter
 * @param {string|null} opts.requested_by    — filter to own requests (non-admin fallback)
 * @param {string}      opts.status
 * @param {string}      opts.keyword
 */
const selectReturnRequests = async ({
    page = 1,
    limit = 10,
    department_id = null,
    department_ids = [],
    requested_by = null,
    status = '',
    keyword = '',
} = {}) => {
    const andConditions = [{ deleted_at: null }];

    if (status) andConditions.push({ status });

    // Department access-control filter
    if (department_id) {
        andConditions.push({ department_id: Number(department_id) });
    } else if (department_ids.length > 0 || requested_by) {
        // Non-admin: show dept records OR own records
        const accessOr = [];
        if (department_ids.length > 0) accessOr.push({ department_id: { in: department_ids } });
        if (requested_by)             accessOr.push({ requested_by });
        andConditions.push({ OR: accessOr });
    }

    if (keyword) {
        andConditions.push({
            OR: [
                { doc_no:      { contains: keyword, mode: 'insensitive' } },
                { departments: { name: { contains: keyword, mode: 'insensitive' } } },
            ],
        });
    }

    const where = { AND: andConditions };

    return prisma.$transaction([
        prisma.reusable_return_requests.findMany({
            where,
            include: returnRequestInclude,
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * Number(limit),
            take: Number(limit),
        }),
        prisma.reusable_return_requests.count({ where }),
    ]);
};

const updateReturnRequestById = async (id, data, tx = prisma) => {
    return tx.reusable_return_requests.update({
        where: { id: Number(id) },
        data,
        include: returnRequestInclude,
    });
};

const selectInUseWithdrawUnitsByDeptAndItem = async ({ departmentId, itemId, take = 0 } = {}, tx = prisma) => {
    return tx.reusable_item_units.findMany({
        where: {
            department_id: Number(departmentId),
            item_id: itemId,
            status: 'IN_USE',
            deleted_at: null,
            movement_logs: {
                some: {
                    action: { in: ['ISSUE_WITHDRAW_REUSABLE', 'ISSUE_REUSABLE'] },
                },
            },
        },
        select: {
            id: true,
            unit_code: true,
            department_id: true,
            movement_logs: {
                where: { action: { in: ['ISSUE_WITHDRAW_REUSABLE', 'ISSUE_REUSABLE'] } },
                select: { action: true, ref_doc_no: true, created_at: true },
                orderBy: { created_at: 'desc' },
                take: 1,
            },
        },
        orderBy: [{ updated_at: 'asc' }, { created_at: 'asc' }],
        take: Number(take) || undefined,
    });
};

const selectUnitsByCodes = async ({ departmentId = null, unitCodes = [] } = {}, tx = prisma) => {
    const normalizedCodes = Array.from(
        new Set(
            (Array.isArray(unitCodes) ? unitCodes : [])
                .map((code) => (code || '').toString().trim())
                .filter(Boolean)
        )
    );

    if (!normalizedCodes.length) return [];

    return tx.reusable_item_units.findMany({
        where: {
            unit_code: { in: normalizedCodes },
            deleted_at: null,
            ...(departmentId ? { department_id: Number(departmentId) } : {}),
        },
        select: {
            id: true,
            item_id: true,
            unit_code: true,
            serial_no: true,
            department_id: true,
            status: true,
            condition: true,
            items: {
                select: {
                    id: true,
                    code: true,
                    name: true,
                },
            },
            movement_logs: {
                where: { action: { in: ['ISSUE_WITHDRAW_REUSABLE', 'ISSUE_REUSABLE', 'ISSUE_BORROW_REUSABLE'] } },
                select: { action: true, ref_doc_no: true, created_at: true },
                orderBy: { created_at: 'desc' },
                take: 1,
            },
        },
    });
};

const selectUnitByBarcodeValue = async ({ value = '', departmentId = null } = {}, tx = prisma) => {
    const key = (value || '').toString().trim();
    if (!key) return null;

    return tx.reusable_item_units.findFirst({
        where: {
            deleted_at: null,
            ...(departmentId ? { department_id: Number(departmentId) } : {}),
            OR: [
                { unit_code: { equals: key, mode: 'insensitive' } },
                { serial_no: { equals: key, mode: 'insensitive' } },
            ],
        },
        select: {
            id: true,
            item_id: true,
            unit_code: true,
            serial_no: true,
            department_id: true,
            status: true,
            condition: true,
            items: {
                select: {
                    id: true,
                    code: true,
                    name: true,
                },
            },
        },
    });
};

const selectLotByBarcodeValue = async ({ value = '' } = {}, tx = prisma) => {
    const key = (value || '').toString().trim();
    if (!key) return null;

    return tx.item_lots.findFirst({
        where: {
            deleted_at: null,
            lot_code: { equals: key, mode: 'insensitive' },
        },
        select: {
            id: true,
            lot_code: true,
            item_id: true,
            quantity: true,
            status: true,
            expired_at: true,
            items: {
                select: {
                    id: true,
                    code: true,
                    name: true,
                },
            },
        },
    });
};

const selectItemByBarcodeValue = async ({ value = '' } = {}, tx = prisma) => {
    const key = (value || '').toString().trim();
    if (!key) return null;

    return tx.items.findFirst({
        where: {
            deleted_at: null,
            code: { equals: key, mode: 'insensitive' },
        },
        select: {
            id: true,
            code: true,
            name: true,
            current_stock: true,
            status: true,
            type: true,
            warehouse_id: true,
        },
    });
};

const selectInUseWithdrawUnitsByIds = async ({ departmentId, unitIds = [] } = {}, tx = prisma) => {
    const normalizedIds = Array.from(
        new Set(
            (Array.isArray(unitIds) ? unitIds : [])
                .map((id) => (id || '').toString().trim())
                .filter(Boolean)
        )
    );

    if (!normalizedIds.length) return [];

    return tx.reusable_item_units.findMany({
        where: {
            id: { in: normalizedIds },
            department_id: Number(departmentId),
            status: 'IN_USE',
            deleted_at: null,
            movement_logs: {
                some: {
                    action: { in: ['ISSUE_WITHDRAW_REUSABLE', 'ISSUE_REUSABLE'] },
                },
            },
        },
        select: {
            id: true,
            item_id: true,
            unit_code: true,
            serial_no: true,
            department_id: true,
            movement_logs: {
                where: { action: { in: ['ISSUE_WITHDRAW_REUSABLE', 'ISSUE_REUSABLE'] } },
                select: { action: true, ref_doc_no: true, created_at: true },
                orderBy: { created_at: 'desc' },
                take: 1,
            },
        },
    });
};

const sumPendingReturnRequestQtyByDepartment = async (
    { departmentId, statuses = ['REQUESTED', 'PROCESSING'] } = {},
    tx = prisma
) => {
    return tx.reusable_return_request_items.groupBy({
        by: ['item_id'],
        where: {
            request: {
                department_id: Number(departmentId),
                deleted_at: null,
                status: { in: statuses },
            },
        },
        _sum: {
            requested_qty: true,
        },
    });
};

module.exports = {
    withTransaction,
    createReceiveHeader,
    createReceiveItems,
    selectReceiveItemsByHeader,
    countTotalUnitsByItemId,
    countUnitsByYear,
    createReusableUnits,
    selectReusableUnits,
    selectReusableUnitById,
    updateReusableUnit,
    createReusableUnitLog,
    selectInUseUnitsByDepartment,
    countReturnRequestsByYear,
    createReturnRequestHeader,
    createReturnRequestItems,
    selectReturnRequestById,
    selectReturnRequests,
    updateReturnRequestById,
    selectInUseWithdrawUnitsByDeptAndItem,
    selectUnitsByCodes,
    selectUnitByBarcodeValue,
    selectLotByBarcodeValue,
    selectItemByBarcodeValue,
    selectInUseWithdrawUnitsByIds,
    sumPendingReturnRequestQtyByDepartment,
};