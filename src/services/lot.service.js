const lotRepo = require('../repositories/lot.repo');
const stockMovementRepo = require('../repositories/stockmovement.repo');
const DTO = require('../dtos/lot.dto');
const { LOT_STATUS, STOCK_MOVEMENT_TYPES } = require('../utils/constants');

const getAllLots = async (query) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const keyword = (query.keyword || query.search || '').toString().trim();
    const warehouse_id = (query.warehouse_id || query.warehouse || '').toString().trim();
    const category_id = (query.category_id || query.category || '').toString().trim();
    const item_id = (query.item_id || query.item || '').toString().trim();
    const status = (query.status || '').toString().trim();
    const start_date = (query.start_date || '').toString().trim();
    const end_date = (query.end_date || '').toString().trim();
    const expiry_days = (query.expiry_days || '').toString().trim();

    await lotRepo.suspendExpiredActiveLots();

    const [items, total] = await lotRepo.selectAllLot({
        page,
        limit,
        keyword,
        warehouse_id,
        category_id,
        item_id,
        status,
        start_date,
        end_date,
        expiry_days,
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
        items: items.map(DTO.mapLotItem),
        total,
        page,
        limit,
        totalPages,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null,
    };
}

const getLotById = async (id) => {
    await lotRepo.suspendExpiredActiveLots();
    const lot = await lotRepo.selectLotById(id);
    if (!lot) return null;

    const movements = await lotRepo.selectLotMovementHistory(id);

    return {
        ...DTO.mapLotItem(lot),
        movements: movements.map(DTO.mapLotMovement),
    };
}

const resolveNote = (payload = {}) => payload.note || null;

const adjustLotStock = async (lotId, payload, user = {}) => {
    await lotRepo.suspendExpiredActiveLots();
    const existingLot = await lotRepo.selectLotById(lotId);
    if (!existingLot) throw new Error("Lot id not found");

    const currentQty = Number(existingLot.quantity || 0);
    const hasNewQuantity = payload.new_quantity !== undefined && payload.new_quantity !== null;
    if (!hasNewQuantity) {
        throw new Error('new_quantity is required');
    }

    const newQty = Number(payload.new_quantity);
    if (Number.isNaN(newQty)) {
        throw new Error('new_quantity must be a valid number');
    }

    if (Number.isNaN(newQty) || newQty < 0) {
        throw new Error('new_quantity cannot be less than 0');
    }

    const qtyDiff = newQty - currentQty;
    const movementType = qtyDiff >= 0 ? 'ADJUST_IN' : 'ADJUST_OUT';
    const movementQty = Math.abs(qtyDiff);
    const reason = (payload.reason || '').toString().trim();
    const userNote = resolveNote(payload);

    const lotCode = existingLot.lot_code || '';
    const itemName = existingLot.items?.name || '';
    const itemCode = existingLot.items?.code || '';
    const sign = qtyDiff >= 0 ? '+' : '';
    const fullNote = [
        `[ปรับสต็อก] ${[itemCode, itemName].filter(Boolean).join(' ')}`,
        `ล็อต ${lotCode}`,
        `${currentQty} → ${newQty} (${sign}${qtyDiff})`,
        reason || 'ปรับนับสต็อก',
        userNote,
    ].filter(Boolean).join(' | ');

    return lotRepo.withTransaction(async (tx) => {
        const nextStatus = payload.status || existingLot.status;
        const data = DTO.adjustLotDTO({
            new_quantity: newQty,
            note: userNote,
            status: nextStatus,
        });

        // Read balance BEFORE the lot is updated
        const balanceBefore = qtyDiff !== 0
            ? await stockMovementRepo.fetchItemCurrentStock(existingLot.item_id, tx)
            : 0;

        await lotRepo.updateLot(lotId, data, tx);

        if (qtyDiff !== 0) {
            await stockMovementRepo.createStockMovement({
                item_id: existingLot.item_id,
                lot_id: existingLot.id,
                quantity: movementQty,
                type: movementType,
                note: fullNote,
                created_by: user.email || null,
                created_by_id: user.sub || null,
                balance_before: balanceBefore,
                balance_after: movementType === 'ADJUST_IN'
                    ? balanceBefore + movementQty
                    : balanceBefore - movementQty,
            }, tx);
        }

        const updatedLot = await lotRepo.selectLotById(lotId, tx);
        const movements = await lotRepo.selectLotMovementHistory(lotId, tx);

        return {
            ...DTO.mapLotItem(updatedLot),
            movements: movements.map(DTO.mapLotMovement),
        };
    });

}

const deleteLot = async (lotId, user = {}) => {
    const existingLot = await lotRepo.selectLotById(lotId);
    if (!existingLot) throw new Error("Lot id not found");

    const currentQty = Number(existingLot.quantity || 0);

    return lotRepo.withTransaction(async (tx) => {
        // Read balance BEFORE the lot is zeroed out
        const balanceBefore = currentQty > 0
            ? await stockMovementRepo.fetchItemCurrentStock(existingLot.item_id, tx)
            : 0;

        const data = {
            quantity: 0,
            status: LOT_STATUS.CANCELLED,
            deleted_at: new Date()
        };

        await lotRepo.updateLot(lotId, data, tx);

        if (currentQty > 0) {
            const cancelLotCode = existingLot.lot_code || '';
            const cancelItemName = existingLot.items?.name || '';
            const cancelItemCode = existingLot.items?.code || '';
            await stockMovementRepo.createStockMovement({
                item_id: existingLot.item_id,
                lot_id: existingLot.id,
                quantity: currentQty,
                type: STOCK_MOVEMENT_TYPES.ADJUST_OUT,
                note: [
                    `[ยกเลิก Lot] ${[cancelItemCode, cancelItemName].filter(Boolean).join(' ')}`,
                    `ล็อต ${cancelLotCode}`,
                    `ตัดออก ${currentQty} ชิ้น`,
                ].filter(Boolean).join(' | '),
                created_by: user.email || null,
                created_by_id: user.sub || null,
                balance_before: balanceBefore,
                balance_after: balanceBefore - currentQty,
            }, tx);
        }

        const updatedLot = await lotRepo.selectLotById(lotId, tx) || existingLot;

        return {
            ...DTO.mapLotItem(updatedLot),
            message: 'Lot soft deleted successfully',
        };
    });
}

const toggleLotStatus = async (lotId, user = {}) => {
    await lotRepo.suspendExpiredActiveLots();
    const existingLot = await lotRepo.selectLotById(lotId);
    if (!existingLot) throw new Error("Lot id not found");

    if (existingLot.status === LOT_STATUS.CANCELLED) {
        throw new Error("Cannot toggle status of a CANCELLED (deleted) lot");
    }

    const now = new Date();
    const isExpired =
        existingLot.expired_at != null && !Number.isNaN(new Date(existingLot.expired_at).getTime()) &&
        new Date(existingLot.expired_at) < now;

    const nextStatus = existingLot.status === LOT_STATUS.ACTIVE ? LOT_STATUS.SUSPENDED : LOT_STATUS.ACTIVE;

    if (nextStatus === LOT_STATUS.ACTIVE && isExpired) {
        throw new Error('ไม่สามารถเปิดใช้งานล็อตที่หมดอายุแล้ว กรุณาปรับวันหมดอายุให้ยังไม่ถึงกำหนดก่อน');
    }

    const STATUS_LABEL = { ACTIVE: 'เปิดใช้งาน', SUSPENDED: 'ระงับชั่วคราว' };
    const prevLabel = STATUS_LABEL[existingLot.status] || existingLot.status;
    const nextLabel = STATUS_LABEL[nextStatus] || nextStatus;

    const itemCode = existingLot.items?.code || '';
    const itemName = existingLot.items?.name || '';
    const lotCode  = existingLot.lot_code || '';

    return lotRepo.withTransaction(async (tx) => {
        const currentStock = await stockMovementRepo.fetchItemCurrentStock(existingLot.item_id, tx);

        await lotRepo.updateLot(lotId, { status: nextStatus }, tx);

        await stockMovementRepo.createStockMovement({
            item_id: existingLot.item_id,
            lot_id: existingLot.id,
            quantity: 0,
            type: STOCK_MOVEMENT_TYPES.UPDATE,
            note: [
                `[เปลี่ยนสถานะ] ${[itemCode, itemName].filter(Boolean).join(' ')}`,
                `ล็อต ${lotCode}`,
                `${prevLabel} → ${nextLabel}`,
            ].join(' | '),
            created_by: user.email || null,
            created_by_id: user.sub || null,
            balance_before: currentStock,
            balance_after: currentStock,
        }, tx);

        const updatedLot = await lotRepo.selectLotById(lotId, tx) || existingLot;

        return {
            ...DTO.mapLotItem(updatedLot),
            message: `Lot status changed to ${nextStatus}`,
        };
    });
}

module.exports = {
    getAllLots,
    getLotById,
    adjustLotStock,
    deleteLot,
    toggleLotStatus,
};