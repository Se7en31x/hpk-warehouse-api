const toBoolean = (value, defaultValue = false) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;

    const normalized = value.toString().trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;

    return defaultValue;
};

const createItemDTO = (data, itemCode) => ({
    name: data.name,
    description: data.description || null,
    code: itemCode,
    min_stock: data.min_stock === null || data.min_stock === undefined ? null : Number(data.min_stock),
    category_id: data.category_id,
    warehouse_id: data.warehouse_id,
    unit_id: data.unit_id,
    status: data.status,
    image_url: data.image_url || null,
    image_public_id: data.image_public_id || null,
    type: data.type || 'CONSUMABLE',
    allowed_req: toBoolean(data.allowed_req, true),
    allowed_borrow: toBoolean(data.allowed_borrow, false),
});

const updateItemDTO = (data = {}) => {
    const payload = {};

    if (Object.prototype.hasOwnProperty.call(data, 'name')) {
        payload.name = data.name;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'description')) {
        payload.description = data.description;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'min_stock')) {
        payload.min_stock = data.min_stock === null || data.min_stock === undefined
            ? null
            : Number(data.min_stock);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'unit_id')) {
        payload.unit_id = data.unit_id || null;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'warehouse_id')) {
        payload.warehouse_id = data.warehouse_id || null;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'category_id')) {
        payload.category_id = data.category_id || null;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'sell_price')) {
        payload.sell_price = data.sell_price === null || data.sell_price === undefined
            ? null
            : Number(data.sell_price);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'status')) {
        payload.status = data.status;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'image_url')) {
        payload.image_url = data.image_url;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'allowed_req')) {
        payload.allowed_req = toBoolean(data.allowed_req, true);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'allowed_borrow')) {
        payload.allowed_borrow = toBoolean(data.allowed_borrow, false);
    }

    return payload;
};

const softDeleteDTO = () => ({
    deleted_at: new Date(),
    status: "UNAVAILABLE",
});

module.exports = {
    createItemDTO,
    updateItemDTO,
    softDeleteDTO,
};