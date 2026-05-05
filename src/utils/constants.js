const LOT_STATUS = {
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
    CANCELLED: 'CANCELLED',
    /** ยอดคงเหลือเป็น 0 จากการเบิกจนหมด — ไม่ใช่การยกเลิกล็อต */
    DEPLETED: 'DEPLETED',
    /** จำหน่ายทิ้ง / ของใช้ไม่ได้ / ห้ามจ่ายถาวร — ไม่ให้สลับสถานะกลับผ่าน toggle (แก้ได้ผ่านปรับสต็อก + ระบุเปิด ACTIVE) */
    DISPOSED: 'DISPOSED',
};

const LOT_EXPIRY_STATUS = {
    NORMAL: 'NORMAL',
    NEAR_EXPIRY: 'NEAR_EXPIRY',
    EXPIRED: 'EXPIRED'
};

const STOCK_MOVEMENT_TYPES = {
    ADJUST_OUT: 'ADJUST_OUT',
    UPDATE: 'UPDATE'
};

module.exports = {
    LOT_STATUS,
    LOT_EXPIRY_STATUS,
    STOCK_MOVEMENT_TYPES
};
