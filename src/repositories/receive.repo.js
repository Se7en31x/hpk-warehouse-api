const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const buildReceiveWhere = ({ keyword = '', type = '', status = '', start_date = '', end_date = '' } = {}) => {
    const where = {};
    const normalizedKeyword = (keyword || '').trim();
    const normalizedType = (type || '').trim();
    const normalizedStatus = (status || '').trim().toUpperCase();

    if (normalizedType) {
        where.type = normalizedType;
    }

    if (normalizedStatus) {
        where.status = normalizedStatus;
    }

    if (normalizedKeyword) {
        where.OR = [
            { doc_no: { contains: normalizedKeyword, mode: 'insensitive' } },
            { donor_name: { contains: normalizedKeyword, mode: 'insensitive' } },
            { note: { contains: normalizedKeyword, mode: 'insensitive' } },
            { supplier: { is: { name: { contains: normalizedKeyword, mode: 'insensitive' } } } },
        ];
    }

    const startDate = start_date ? new Date(start_date) : null;
    const endDate = end_date ? new Date(end_date) : null;

    if (startDate || endDate) {
        where.receive_date = {
            gte: startDate || undefined,
            lte: endDate || undefined,
        };
    }

    return where;
};

const withTransaction = async (callback) => {
    return prisma.$transaction((tx) => callback(tx), {
        timeout: 30000 // 30 seconds to allow for bulk asset creation
    });
};

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
            supplier: { select: { id: true, name: true } },
            receive_item: {
                include: {
                    items: { select: { id: true, code: true, name: true } },
                },
            },
        },
    });
};

const SelectAllReceives = async ({ page = 1, limit = 10, keyword = '', type = '', status = '', start_date = '', end_date = '' } = {}) => {
    const where = buildReceiveWhere({ keyword, type, status, start_date, end_date });
    const skip = (page - 1) * limit;

    return prisma.$transaction([
        prisma.receive_header.findMany({
            where,
            include: {
                supplier: { select: { id: true, name: true } },
                receive_item: {
                    include: {
                        items: { select: { id: true, code: true, name: true } },
                    },
                    orderBy: { id: 'asc' },
                },
            },
            orderBy: [{ receive_date: 'desc' }, { id: 'desc' }],
            skip,
            take: limit,
        }),
        prisma.receive_header.count({ where }),
    ]);
};

module.exports = {
    withTransaction,
    createReceiveHeader,
    createReceiveItems,
    updateReceiveHeader,
    SelectReceiveById,
    SelectAllReceives,
};
