const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const buildItemWhere = ({ keyword = '', start_date = '', end_date = '', type = '' } = {}) => {
    const normalizedKeyword = (keyword || '').trim();
    const normalizedType = (type || '').trim().toUpperCase();

    const where = { deleted_at: null };

    if (normalizedType) {
        where.type = normalizedType;
    }

    if (normalizedKeyword) {
        where.OR = [
            { code: { contains: normalizedKeyword, mode: 'insensitive' } },
            { name: { contains: normalizedKeyword, mode: 'insensitive' } },
            { category_name: { contains: normalizedKeyword, mode: 'insensitive' } },
            { unit_name: { contains: normalizedKeyword, mode: 'insensitive' } },
            { warehouse_name: { contains: normalizedKeyword, mode: 'insensitive' } },
        ];
    }

    const dateFilter = {};
    if (start_date) {
        const startDate = new Date(start_date);
        if (!Number.isNaN(startDate.getTime())) {
            dateFilter.gte = startDate;
        }
    }

    if (end_date) {
        const endDate = new Date(end_date);
        if (!Number.isNaN(endDate.getTime())) {
            endDate.setHours(23, 59, 59, 999);
            dateFilter.lte = endDate;
        }
    }

    if (Object.keys(dateFilter).length > 0) {
        where.created_at = dateFilter;
    }

    return where;
};

const generateItemCode = async (category_id) => {
    const category = await prisma.categories.findFirst({ where: { id: category_id, deleted_at: null } });
    const prefix = category?.code_prefix || "ITEM";
    const lastItem = await prisma.items.findFirst({
        where: { category_id, code: { startsWith: prefix } },
        orderBy: { code: 'desc' }
    });

    let nextNumber = 1;
    if (lastItem?.code) {
        const parts = lastItem.code.split('-');
        const lastRunningNo = parseInt(parts[1]);
        if (!isNaN(lastRunningNo)) nextNumber = lastRunningNo + 1;
    }

    let newCode = "";
    let isUnique = false;
    while (!isUnique) {
        newCode = `${prefix}-${String(nextNumber).padStart(6, '0')}`;
        const existingItem = await prisma.items.findFirst({ where: { code: newCode } });
        if (!existingItem) isUnique = true; else nextNumber++;
    }
    return newCode;
};

const SelectAllItems = ({ page = 1, limit = 10, keyword = '', start_date = '', end_date = '', type = '', allowed_req, allowed_borrow  } = {}) => {
    const normalizedKeyword = (keyword || '').trim();
    const normalizedType = (type || '').trim().toUpperCase();
    const skip = (page - 1) * limit;

    const where = { deleted_at: null };

    if (normalizedType) {
        where.type = normalizedType;
    }

    if (normalizedKeyword) {
        where.OR = [
            { code: { contains: normalizedKeyword, mode: 'insensitive' } },
            { name: { contains: normalizedKeyword, mode: 'insensitive' } },
            { categories: { is: { name: { contains: normalizedKeyword, mode: 'insensitive' } } } },
        ];
    }

if (allowed_req !== undefined) {
        where.allowed_req = allowed_req;
    }
    
    if (allowed_borrow !== undefined) {
        where.allowed_borrow = allowed_borrow;
    }
    
    const dateFilter = {};
    if (start_date) {
        const startDate = new Date(start_date);
        if (!Number.isNaN(startDate.getTime())) dateFilter.gte = startDate;
    }
    if (end_date) {
        const endDate = new Date(end_date);
        if (!Number.isNaN(endDate.getTime())) {
            endDate.setHours(23, 59, 59, 999);
            dateFilter.lte = endDate;
        }
    }
    if (Object.keys(dateFilter).length > 0) where.created_at = dateFilter;

    return prisma.$transaction([
        prisma.items.findMany({
            where,
            select: {
                id: true, code: true, name: true, description: true,
                category_id: true, unit_id: true, warehouse_id: true,
                current_stock: true, min_stock: true, status: true,
                image_url: true, type: true, allowed_req: true, allowed_borrow: true,
                created_at: true, updated_at: true,
                categories: { select: { name: true } },
                unit: { select: { name: true } },
                warehouses: { select: { name: true } },
            },
            orderBy: { created_at: 'desc' },
            skip,
            take: limit,
        }),
        prisma.items.count({ where }),
    ]);
};

const SelectItemById = (id) => {
    return prisma.items.findFirst({
        where: { id, deleted_at: null },
        select: {
            id: true,
            code: true,
            name: true,
            description: true,
            category_id: true,
            unit_id: true,
            warehouse_id: true,
            current_stock: true,
            min_stock: true,
            sell_price: true,
            status: true,
            image_url: true,
            type: true,
            allowed_req: true,
            allowed_borrow: true,
            created_at: true,
            updated_at: true,
            categories: { select: { name: true } },
            unit: { select: { name: true } },
            warehouses: { select: { name: true } },
        }
    });
};

const selectCategoryById = (id) => {
    return prisma.categories.findFirst({
        where: { id, deleted_at: null },
        select: { id: true, item_type: true },
    });
};

const countItemUsages = async (itemId) => {
    const [receiveCount, lotCount, requisitionCount, medAssetCount, reusableUnitCount] = await prisma.$transaction([
        prisma.receive_item.count({ where: { item_id: itemId } }),
        prisma.item_lots.count({ where: { item_id: itemId } }),
        prisma.requisition_item.count({ where: { item_id: itemId } }),
        prisma.medical_assets.count({ where: { item_id: itemId } }),
        prisma.reusable_item_units.count({ where: { item_id: itemId, deleted_at: null } }),
    ]);

    return receiveCount + lotCount + requisitionCount + medAssetCount + reusableUnitCount;
};

const countAvailableReusableUnitsByItemIds = async (itemIds = []) => {
    const normalizedIds = Array.from(new Set((itemIds || []).filter(Boolean)));
    if (!normalizedIds.length) return [];

    return prisma.reusable_item_units.groupBy({
        by: ['item_id'],
        where: {
            item_id: { in: normalizedIds },
            status: 'AVAILABLE',
            condition: 'GOOD',
            deleted_at: null,
        },
        _count: {
            _all: true,
        },
    });
};

const createItem = (data) => prisma.items.create({ data });

const updateItem = (id, data, tx = prisma) => tx.items.update({
    where: { id },
    data
});

const softDeletedItem = (id, data) => prisma.items.update({
    where: { id },
    data
});

const SelectItemPublicId = (id) => prisma.items.findFirst({
    where: { id, deleted_at: null },
    select: { id: true, image_public_id: true },
});

const selectOptions = () => Promise.all([
    prisma.categories.findMany({ where: { deleted_at: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.units.findMany({ where: { deleted_at: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.warehouses.findMany({ where: { deleted_at: null }, orderBy: { name: 'asc' }, select: { id: true, name: true } })
]);

module.exports = {
    generateItemCode,
    SelectAllItems,
    SelectItemById,
    selectCategoryById,
    countItemUsages,
    countAvailableReusableUnitsByItemIds,
    SelectItemPublicId,
    createItem,
    updateItem,
    softDeletedItem,
    selectOptions,
}