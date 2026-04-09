const { LOT_EXPIRY_STATUS } = require('../utils/constants');

const calcExpiryStatus = (expiredAt) => {
    if (!expiredAt) return 'NO_EXPIRY';

    const now = new Date();
    const expireDate = new Date(expiredAt);
    const diffMs = expireDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return LOT_EXPIRY_STATUS.EXPIRED;
    if (diffDays <= 30) return LOT_EXPIRY_STATUS.NEAR_EXPIRY;
    return LOT_EXPIRY_STATUS.NORMAL;
};

const adjustLotDTO = (payload) => {
    return {
        quantity: Number(payload.new_quantity),
        note: payload.note || null,
        status: payload.status,
    }
}

const mapLotItem = (lot = {}) => ({
    id: lot.id,
    lot_code: lot.lot_code,
    item_id: lot.item_id,
    item_code: lot.items?.code || null,
    item_name: lot.items?.name || null,
    category_id: lot.items?.category_id || null,
    category_name: lot.items?.categories?.name || null,
    unit_id: lot.items?.unit_id || null,
    unit_name: lot.items?.unit?.name || null,
    warehouse_id: lot.warehouse_id,
    warehouse_name: lot.warehouses?.name || null,
    warehouse_location: lot.warehouses?.location || null,
    quantity: lot.quantity || 0,
    status: lot.status,
    expiry_status: calcExpiryStatus(lot.expired_at),
    expired_at: lot.expired_at,
    note: lot.note,
    created_at: lot.created_at,
    updated_at: lot.updated_at,
});

const mapLotMovement = (movement = {}) => ({
    id: movement.id,
    type: movement.type,
    quantity: movement.quantity || 0,
    note: movement.note,
    created_by: movement.created_by,
    created_by_id: movement.created_by_id,
    created_at: movement.created_at,
    item_id: movement.item_id,
    item_code: movement.items?.code || null,
    item_name: movement.items?.name || null,
});

module.exports = {
    adjustLotDTO,
    mapLotItem,
    mapLotMovement,
};