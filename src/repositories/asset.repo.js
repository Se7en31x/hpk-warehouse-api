const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const assetInclude = {
    items: { select: { id: true, name: true, code: true } },
    // Join ข้อมูลแผนก (พหูพจน์ตาม Schema: departments)
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
    // ตรวจสอบให้แน่ใจว่า data.department_id ที่ส่งมาเป็น Number
    return tx.medical_assets.create({ 
        data: {
            ...data,
            department_id: data.department_id ? Number(data.department_id) : null
        }, 
        include: assetInclude 
    });
};

/**
 * @param {object} opts
 * @param {number}   opts.page
 * @param {number}   opts.limit
 * @param {string}   opts.keyword
 * @param {number|null} opts.department_id   — exact dept filter (admin override)
 * @param {number[]} opts.department_ids     — non-admin: filter to IN list
 * @param {string}   opts.status
 * @param {string}   opts.item_id
 */
const selectAllAssets = async ({
    page = 1,
    limit = 10,
    keyword = '',
    department_id = null,
    department_ids = [],
    status = '',
    item_id = '',
} = {}) => {
    const where = {};

    if (status)  where.status  = status;
    if (item_id) where.item_id = item_id;

    // Exact department filter takes precedence
    if (department_id) {
        where.department_id = Number(department_id);
    } else if (department_ids.length > 0) {
        // Non-admin: restrict to allowed departments
        where.department_id = { in: department_ids };
    }

    if (keyword) {
        const normalizedKeyword = keyword.trim();
        where.OR = [
            { asset_code:  { contains: normalizedKeyword, mode: 'insensitive' } },
            { serial_no:   { contains: normalizedKeyword, mode: 'insensitive' } },
            { items:       { name: { contains: normalizedKeyword, mode: 'insensitive' } } },
            { departments: { name: { contains: normalizedKeyword, mode: 'insensitive' } } },
        ];
    }

    const [items, total] = await prisma.$transaction([
        prisma.medical_assets.findMany({
            where,
            include: assetInclude,
            skip: (page - 1) * Number(limit),
            take: Number(limit),
            orderBy: { created_at: 'desc' },
        }),
        prisma.medical_assets.count({ where }),
    ]);

    return [items, total];
};

const selectAssetById = async (id, tx = prisma) => {
    return tx.medical_assets.findUnique({ 
        where: { id }, 
        include: assetInclude 
    });
};

const updateAsset = async (id, data, tx = prisma) => {
    // แปลง department_id เป็น Number ถ้ามีการส่งมาอัปเดต
    const updateData = { ...data };
    if (updateData.department_id) {
        updateData.department_id = Number(updateData.department_id);
    }

    return tx.medical_assets.update({ 
        where: { id }, 
        data: updateData, 
        include: assetInclude 
    });
};

/**
 * Returns the count of medical_assets grouped by item_id.
 * Used by the asset list page to show how many units are registered per item type.
 * @param {string[]} itemIds
 * @returns {Promise<Array<{ item_id: string, _count: { _all: number } }>>}
 */
const selectAssetCountsByItemIds = async (itemIds = []) => {
    if (!itemIds.length) return [];
    return prisma.medical_assets.groupBy({
        by: ['item_id'],
        where: { item_id: { in: itemIds } },
        _count: { _all: true },
    });
};

module.exports = {
    generateAssetCode,
    createAsset,
    selectAllAssets,
    selectAssetById,
    updateAsset,
    selectAssetCountsByItemIds,
};