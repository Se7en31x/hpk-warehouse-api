const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const assetInclude = {
    items: { select: { id: true, name: true, code: true } },
    departments: { select: { id: true, name: true } },
    receive_item: {
        select: {
            id: true,
            receive_header: { select: { id: true, doc_no: true } },
        },
    },
};

const generateAssetCode = async (tx = prisma) => {
    const year = new Date().getFullYear();
    const prefix = `AST-${year}`;
    const count = await tx.medical_assets.count({
        where: { asset_code: { startsWith: prefix } },
    });
    const seq = String(count + 1).padStart(5, '0');
    return `${prefix}${seq}`;
};

const createAsset = async (data, tx = prisma) => {
    return tx.medical_assets.create({ data, include: assetInclude });
};

const selectAllAssets = async ({ page = 1, limit = 10, keyword = '', department_id = '', status = '', item_id = '' } = {}) => {
    const where = {};

    if (status) where.status = status;
    if (item_id) where.item_id = item_id;
    if (department_id) where.department_id = Number(department_id);

    if (keyword) {
        where.OR = [
            { asset_code: { contains: keyword, mode: 'insensitive' } },
            { serial_no: { contains: keyword, mode: 'insensitive' } },
            { items: { is: { name: { contains: keyword, mode: 'insensitive' } } } },
        ];
    }

    const [items, total] = await prisma.$transaction([
        prisma.medical_assets.findMany({
            where,
            include: assetInclude,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { created_at: 'desc' },
        }),
        prisma.medical_assets.count({ where }),
    ]);

    return [items, total];
};

const selectAssetById = async (id, tx = prisma) => {
    return tx.medical_assets.findUnique({ where: { id }, include: assetInclude });
};

const updateAsset = async (id, data, tx = prisma) => {
    return tx.medical_assets.update({ where: { id }, data, include: assetInclude });
};

module.exports = {
    generateAssetCode,
    createAsset,
    selectAllAssets,
    selectAssetById,
    updateAsset,
};
