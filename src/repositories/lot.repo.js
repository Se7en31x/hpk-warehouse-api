const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const buildLotWhere = ({ keyword = '', warehouse_id = '', category_id = '', item_id = '', status = '' } = {}) => {
    const where = { deleted_at: null, AND: [] };
    const normalizedKeyword = (keyword || '').trim();
    const normalizedWarehouseId = (warehouse_id || '').trim();
    const normalizedCategoryId = (category_id || '').trim();
    const normalizedItemId = (item_id || '').trim();
    const normalizedStatus = (status || '').toString().trim().toUpperCase();

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

const selectAllLot = ({ page = 1, limit = 10, keyword = '', warehouse_id = '', category_id = '', item_id = '', status = '' } = {}) => {
    const where = buildLotWhere({ keyword, warehouse_id, category_id, item_id, status });
    const skip = (page - 1) * limit;

    return prisma.$transaction([
        prisma.item_lots.findMany({
            where,
            select: lotSelect,
            orderBy: [{ expired_at: 'asc' }, { created_at: 'desc' }],
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

const decrementLotQuantitySafe = async (lotId, qty, tx = prisma) => {
    return tx.item_lots.updateMany({
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

module.exports = {
    selectAllLot,
    selectLotById,
    selectLotMovementHistory,
    upsertItemLot,
    selectLotByItemAndCode,
    decrementLotQuantitySafe,
    updateLot,
    withTransaction,
};