const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const buildLotWhere = ({ keyword = '', warehouse_id = '', category_id = '', item_id = '', status = '', start_date = '', end_date = '', expiry_days = '' } = {}) => {
    const where = { deleted_at: null, AND: [] };
    const normalizedKeyword = (keyword || '').trim();
    const normalizedWarehouseId = (warehouse_id || '').trim();
    const normalizedCategoryId = (category_id || '').trim();
    const normalizedItemId = (item_id || '').trim();
    const normalizedStatus = (status || '').toString().trim().toUpperCase();
    const normalizedStartDate = (start_date || '').trim();
    const normalizedEndDate = (end_date || '').trim();
    const normalizedExpiryDays = Number(expiry_days) || 0;

    if (normalizedKeyword) {
        where.AND.push({
            OR: [
                { lot_code: { contains: normalizedKeyword, mode: 'insensitive' } },
                { items: { is: { name: { contains: normalizedKeyword, mode: 'insensitive' } } } },
                { items: { is: { code: { contains: normalizedKeyword, mode: 'insensitive' } } } },
                { warehouses: { is: { name: { contains: normalizedKeyword, mode: 'insensitive' } } } },
            ],
        });
    }

    if (normalizedWarehouseId && normalizedWarehouseId !== 'ALL') {
        where.AND.push({ warehouse_id: normalizedWarehouseId });
    }

    if (normalizedCategoryId && normalizedCategoryId !== 'ALL') {
        where.AND.push({ items: { is: { category_id: normalizedCategoryId } } });
    }

    if (normalizedItemId) {
        where.AND.push({ item_id: normalizedItemId });
    }

    if (normalizedStatus) {
        where.AND.push({ status: normalizedStatus });
    }

    if (normalizedStartDate || normalizedEndDate) {
        const dateFilter = {};
        if (normalizedStartDate) dateFilter.gte = new Date(normalizedStartDate);
        if (normalizedEndDate) {
            const end = new Date(normalizedEndDate);
            end.setHours(23, 59, 59, 999);
            dateFilter.lte = end;
        }
        where.AND.push({ created_at: dateFilter });
    }

    if (normalizedExpiryDays > 0) {
        const now = new Date();
        const future = new Date();
        future.setDate(future.getDate() + normalizedExpiryDays);
        future.setHours(23, 59, 59, 999);
        where.AND.push({ quantity: { gt: 0 } });
        where.AND.push({ expired_at: { not: null, gte: now, lte: future } });
    }

    if (!where.AND.length) {
        delete where.AND;
    }

    return where;
};

const lotSelect = {
    id: true,
    lot_code: true,
    quantity: true,
    status: true,
    note: true,
    expired_at: true,
    mfg_at: true,
    created_at: true,
    updated_at: true,
    item_id: true,
    warehouse_id: true,
    items: {
        select: {
            id: true,
            code: true,
            name: true,
            category_id: true,
            unit_id: true,
            categories: {
                select: {
                    id: true,
                    name: true,
                },
            },
            unit: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    },
    warehouses: {
        select: {
            id: true,
            name: true,
            location: true,
        },
    },
};

const selectAllLot = ({ page = 1, limit = 10, keyword = '', warehouse_id = '', category_id = '', item_id = '', status = '', start_date = '', end_date = '', expiry_days = '' } = {}) => {
    const where = buildLotWhere({ keyword, warehouse_id, category_id, item_id, status, start_date, end_date, expiry_days });
    const skip = (page - 1) * limit;

    return prisma.$transaction([
        prisma.item_lots.findMany({
            where,
            select: lotSelect,
            orderBy: { created_at: 'desc' },
            skip,
            take: limit,
        }),
        prisma.item_lots.count({ where }),
    ]);
};

const selectLotById = async (id, tx = prisma) => {
    if (!id) return null;

    const lot = await tx.item_lots.findFirst({
        where: { id, deleted_at: null },
        select: lotSelect,
    });

    return lot;
};

const selectLotMovementHistory = async (lotId, tx = prisma) => {
    return tx.stocks_movement.findMany({
        where: { lot_id: lotId },
        select: {
            id: true,
            item_id: true,
            quantity: true,
            type: true,
            note: true,
            created_by: true,
            created_by_id: true,
            created_at: true,
            items: {
                select: {
                    id: true,
                    code: true,
                    name: true,
                },
            },
        },
        orderBy: { created_at: 'desc' },
    });
};

const upsertItemLot = async ({ where, update, create }, tx = prisma) => {
    return tx.item_lots.upsert({
        where,
        update,
        create,
        select: { id: true },
    });
};

const selectLotByItemAndCode = async (itemId, lotCode, tx = prisma) => {
    return tx.item_lots.findUnique({
        where: {
            item_id_lot_code: {
                item_id: itemId,
                lot_code: lotCode,
            },
        },
        select: {
            id: true,
            quantity: true,
            item_id: true,
            lot_code: true,
        },
    });
};

/**
 * Batch fetch lots ตาม pairs ของ (item_id, lot_code)
 * ใช้ enrich หน้ารายละเอียดการรับเข้า เพื่อให้รู้ lot_id + ข้อมูลล็อตจริง
 */
const selectLotsByItemCodePairs = async (pairs = [], tx = prisma) => {
    const valid = (pairs || []).filter(
        (p) => p && p.item_id && p.lot_code
    );
    if (valid.length === 0) return [];
    return tx.item_lots.findMany({
        where: {
            OR: valid.map((p) => ({
                item_id: p.item_id,
                lot_code: p.lot_code,
            })),
        },
        select: {
            id: true,
            item_id: true,
            lot_code: true,
            quantity: true,
            status: true,
            expired_at: true,
            mfg_at: true,
        },
    });
};

/** ล็อต ACTIVE แต่ยอด 0 → เบิกหมดแล้ว (รองรับข้อมูลเก่าก่อนมี DEPLETED) */
const closeZeroActiveLots = async () => {
    return prisma.item_lots.updateMany({
        where: { deleted_at: null, status: 'ACTIVE', quantity: 0 },
        data: { status: 'DEPLETED', updated_at: new Date() },
    });
};

const decrementLotQuantitySafe = async (lotId, qty, tx = prisma) => {
    const result = await tx.item_lots.updateMany({
        where: {
            id: lotId,
            quantity: { gte: qty },
            deleted_at: null,
        },
        data: {
            quantity: {
                decrement: qty,
            },
        },
    });
    if (result.count > 0) {
        await tx.item_lots.updateMany({
            where: {
                id: lotId,
                deleted_at: null,
                quantity: 0,
                status: 'ACTIVE',
            },
            data: { status: 'DEPLETED', updated_at: new Date() },
        });
    }
    return result;
};

const updateLot = async (lotId, data, tx = prisma) => {
    await tx.item_lots.updateMany({
        where: { id: lotId, deleted_at: null },
        data
    });

    return tx.item_lots.findFirst({
        where: { id: lotId, deleted_at: null },
        select: lotSelect,
    });
};

const withTransaction = async (callback) => {
    return prisma.$transaction((tx) => callback(tx));
};

/** ล็อตที่หมดอายุแล้วแต่ยัง ACTIVE → ระงับอัตโนมัติ (ไม่บันทึก stock_movement) */
const suspendExpiredActiveLots = async () => {
    const now = new Date();
    return prisma.item_lots.updateMany({
        where: {
            deleted_at: null,
            status: 'ACTIVE',
            expired_at: { not: null, lt: now },
        },
        data: { status: 'SUSPENDED', updated_at: new Date() },
    });
};

module.exports = {
    selectAllLot,
    selectLotById,
    selectLotMovementHistory,
    upsertItemLot,
    selectLotByItemAndCode,
    selectLotsByItemCodePairs,
    decrementLotQuantitySafe,
    updateLot,
    withTransaction,
    suspendExpiredActiveLots,
    closeZeroActiveLots,
};