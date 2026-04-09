const itemRepo = require('../repositories/item.repo')
const DTO = require('../dtos/item.dto')
const { uploadToCloudinary } = require('../middleware/upload')

const normalizeItemType = (value) => {
    const normalized = (value || '').toString().trim().toUpperCase();
    if (!normalized) return 'CONSUMABLE';
    if (normalized === 'ASSET') return 'MED_ASSET';
    if (['CONSUMABLE', 'REUSABLE', 'MED_ASSET'].includes(normalized)) return normalized;
    return 'CONSUMABLE';
};

const getAllItems = async ({ page = 1, limit = 10, keyword = '', start_date = '', end_date = '', type = '', allowed_req, allowed_borrow } = {}) => {
    const [items, total] = await itemRepo.SelectAllItems({
        page, limit, keyword, start_date, end_date, type, allowed_req, allowed_borrow,
    });

    const reusableItemIds = (items || [])
        .filter((item) => normalizeItemType(item.type) === 'REUSABLE')
        .map((item) => item.id);

    const reusableAvailableRows = await itemRepo.countAvailableReusableUnitsByItemIds(reusableItemIds);
    const availableMap = new Map(
        (reusableAvailableRows || []).map((row) => [row.item_id, Number(row._count?._all || 0)])
    );

    const enrichedItems = (items || []).map((item) => {
        if (normalizeItemType(item.type) !== 'REUSABLE') {
            return { ...item, available_stock: null };
        }

        return {
            ...item,
            available_stock: availableMap.get(item.id) || 0,
        };
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
        items: enrichedItems,
        total,
        page,
        limit,
        totalPages,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null,
    };
}

const getItemById = async (id) => {
    const item = await itemRepo.SelectItemById(id);
    if (!item) throw new Error("Item id not found");
    return item
}

const createItem = async (data, file = null) => {
    let image_url = null;
    let image_public_id = null;
    if (file) {
        const result = await uploadToCloudinary(file.buffer, 'items');
        image_url = result.secure_url;
        image_public_id = result.public_id;
    }

    const category = await itemRepo.selectCategoryById(data.category_id);
    if (!category) throw new Error('Category id not found');

    const itemCode = await itemRepo.generateItemCode(data.category_id);
    const payload = DTO.createItemDTO(
        {
            ...data,
            type: normalizeItemType(category.item_type),
            image_url,
            image_public_id,
        },
        itemCode
    );

    // Borrow permission is valid only for REUSABLE items.
    if (normalizeItemType(payload.type) !== 'REUSABLE') {
        payload.allowed_borrow = false;
    }

    const newItem = await itemRepo.createItem(payload);

    return newItem;
}

const updateItem = async (id, data) => {
    const existingItem = await itemRepo.SelectItemById(id);
    if (!existingItem) throw new Error("Item id not found");

    const hasTypeInput = Object.prototype.hasOwnProperty.call(data || {}, 'type');
    const hasCategoryInput = Object.prototype.hasOwnProperty.call(data || {}, 'category_id');

    if (hasTypeInput) {
        throw new Error('Item type is controlled by category and cannot be edited directly');
    }

    if (hasCategoryInput && data.category_id && data.category_id !== existingItem.category_id) {
        const usageCount = await itemRepo.countItemUsages(id);
        if (usageCount > 0) {
            throw new Error('Cannot change category for this item because it already has transactions');
        }
    }

    const payload = DTO.updateItemDTO(data);

    if (hasCategoryInput && data.category_id) {
        const category = await itemRepo.selectCategoryById(data.category_id);
        if (!category) throw new Error('Category id not found');
        payload.type = normalizeItemType(category.item_type);
    }

    const effectiveType = normalizeItemType(payload.type || existingItem.type);
    if (effectiveType !== 'REUSABLE') {
        payload.allowed_borrow = false;
    }

    const itemUpdated = await itemRepo.updateItem(id, payload)
    return itemUpdated;
}

const softDeletedItem = async (id) => {
    const existingItem = await itemRepo.SelectItemById(id);
    if (!existingItem) throw new Error("Item id not found");

    const payload = DTO.softDeleteDTO()
    const itemDeleted = await itemRepo.softDeletedItem(id, payload)

    return itemDeleted;
}

const getItemOption = async () => {
    const [category, unit, warehouse] = await itemRepo.selectOptions();

    const result = {
        category: category,
        unit: unit,
        warehouse: warehouse
    };

    return result;
}

module.exports = {
    getAllItems,
    getItemById,
    createItem,
    getItemOption,
    softDeletedItem,
    updateItem,
}