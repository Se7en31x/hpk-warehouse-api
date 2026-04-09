const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const toUuidOrNull = (value) => {
    const text = (value || '').toString().trim();
    if (!text) return null;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(text) ? text : null;
};

const createStockMovement = (data, tx = prisma) => {
    const { item_id, note, ...rest } = data || {};

    const payload = {
        ...rest,
        created_by_id: toUuidOrNull(rest?.created_by_id),
        note: note || null,
    };

    if (item_id) {
        payload.items = { connect: { id: item_id } };
    }

    return tx.stocks_movement.create({ data: payload });
};

const buildMovementWhere = ({ keyword = '', type = '', start_date = '', end_date = '' } = {}) => {
    const where = {};

    if (type) {
        where.type = type.toUpperCase();
    }

    if (keyword) {
        where.OR = [
            { created_by: { contains: keyword, mode: 'insensitive' } },
            { note: { contains: keyword, mode: 'insensitive' } },
            { items: { name: { contains: keyword, mode: 'insensitive' } } },
            { items: { code: { contains: keyword, mode: 'insensitive' } } },
        ];
    }

    const dateFilter = {};
    if (start_date) {
        const d = new Date(start_date);
        if (!isNaN(d.getTime())) dateFilter.gte = d;
    }
    if (end_date) {
        const d = new Date(end_date);
        if (!isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); dateFilter.lte = d; }
    }
    if (Object.keys(dateFilter).length > 0) where.created_at = dateFilter;

    return where;
};

const SelectAllMovements = async ({ page = 1, limit = 10, keyword = '', type = '', start_date = '', end_date = '' } = {}) => {
    const skip = (page - 1) * limit;
    const where = buildMovementWhere({ keyword, type, start_date, end_date });

    const [rows, total] = await prisma.$transaction([
        prisma.stocks_movement.findMany({
            where,
            skip,
            take: limit,
            orderBy: { created_at: 'desc' },
            include: {
                items: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        image_url: true,
                        categories: { select: { id: true, name: true } },
                        unit: { select: { id: true, name: true } },
                    },
                },
            },
        }),
        prisma.stocks_movement.count({ where }),
    ]);

    return [rows, total];
};

const SelectMovementById = (id) => {
    return prisma.stocks_movement.findUnique({
        where: { id: Number(id) },
        include: {
            items: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                    image_url: true,
                    categories: { select: { id: true, name: true } },
                    unit: { select: { id: true, name: true } },
                },
            },
        },
    });
};

module.exports = {
    createStockMovement,
    SelectAllMovements,
    SelectMovementById,
};
