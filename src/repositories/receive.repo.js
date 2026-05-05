const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────────────────────────

const buildBatchWhere = ({ keyword = '', type = '', status = '', start_date = '', end_date = '' } = {}) => {
    const conditions = [];
    const normalizedKeyword = (keyword || '').trim();
    const normalizedType = (type || '').trim();
    const normalizedStatus = (status || '').trim().toUpperCase();

    if (normalizedType) {
        conditions.push({ receive_header: { some: { type: normalizedType } } });
    }

    if (normalizedStatus) {
        conditions.push({ receive_header: { some: { status: normalizedStatus } } });
    }

    if (normalizedKeyword) {
        conditions.push({
            OR: [
                { batch_no: { contains: normalizedKeyword, mode: 'insensitive' } },
                { donor_name: { contains: normalizedKeyword, mode: 'insensitive' } },
                { delivery_doc_no: { contains: normalizedKeyword, mode: 'insensitive' } },
                { note: { contains: normalizedKeyword, mode: 'insensitive' } },
                { supplier: { name: { contains: normalizedKeyword, mode: 'insensitive' } } },
                { receive_header: { some: { doc_no: { contains: normalizedKeyword, mode: 'insensitive' } } } },
            ],
        });
    }

    const startDate = start_date ? new Date(start_date) : null;
    const endDate = end_date ? new Date(end_date) : null;

    if (startDate || endDate) {
        conditions.push({
            receive_date: {
                gte: startDate || undefined,
                lte: endDate || undefined,
            },
        });
    }

    return conditions.length > 0 ? { AND: conditions } : {};
};

const receiveItemItemsInclude = {
    select: {
        id: true,
        code: true,
        name: true,
        categories: { select: { name: true } },
    },
};

const batchInclude = {
    supplier: { select: { id: true, name: true } },
    profiles: {
        select: {
            firstname_th: true,
            lastname_th: true,
            firstname_en: true,
            lastname_en: true,
        },
    },
    receive_header: {
        include: {
            receive_item: {
                include: {
                    items: receiveItemItemsInclude,
                },
                orderBy: { id: 'asc' },
            },
        },
        orderBy: { id: 'asc' },
    },
};

// ── Transactions ───────────────────────────────────────────────────────────────

const withTransaction = async (callback) => {
    return prisma.$transaction((tx) => callback(tx), {
        timeout: 30000,
    });
};

// ── Batch ──────────────────────────────────────────────────────────────────────

const createReceiveBatch = async (data, tx = prisma) => {
    return tx.receive_batch.create({ data });
};

const SelectBatchById = async (batchId, tx = prisma) => {
    return tx.receive_batch.findUnique({
        where: { id: batchId },
        include: batchInclude,
    });
};

const SelectAllBatches = async ({
    page = 1,
    limit = 10,
    keyword = '',
    type = '',
    status = '',
    start_date = '',
    end_date = '',
} = {}) => {
    const where = buildBatchWhere({ keyword, type, status, start_date, end_date });
    const skip = (page - 1) * limit;

    return prisma.$transaction([
        prisma.receive_batch.findMany({
            where,
            include: batchInclude,
            orderBy: [{ receive_date: 'desc' }, { id: 'desc' }],
            skip,
            take: limit,
        }),
        prisma.receive_batch.count({ where }),
    ]);
};

// ── Header ─────────────────────────────────────────────────────────────────────

const createReceiveHeader = async (data, tx = prisma) => {
    return tx.receive_header.create({ data });
};

const createReceiveItems = async (data, tx = prisma) => {
    return tx.receive_item.createMany({ data });
};

const updateReceiveHeader = async (id, data, tx = prisma) => {
    return tx.receive_header.update({
        where: { id },
        data,
    });
};

const SelectReceiveById = async (id, tx = prisma) => {
    return tx.receive_header.findUnique({
        where: { id },
        include: {
            receive_item: {
                include: {
                    items: receiveItemItemsInclude,
                },
            },
        },
    });
};

const selectReceiveItemsByHeader = async (headerId, tx = prisma) => {
    return tx.receive_item.findMany({
        where: { header_id: Number(headerId) },
        select: { id: true, item_id: true },
    });
};

module.exports = {
    withTransaction,
    createReceiveBatch,
    SelectBatchById,
    SelectAllBatches,
    createReceiveHeader,
    createReceiveItems,
    updateReceiveHeader,
    SelectReceiveById,
    selectReceiveItemsByHeader,
};
