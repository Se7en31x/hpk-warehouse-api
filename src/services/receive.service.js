const DTO = require('../dtos/receive.dto');
const receiveRepo = require('../repositories/receive.repo');
const lotRepo = require('../repositories/lot.repo');
const stockMovementRepo = require('../repositories/stockmovement.repo');
const assetRepo = require('../repositories/asset.repo');

const RECEIVE_STATUS = {
    PENDING: 'PENDING',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
};

const ASSET_TYPE = 'PURCHASE_ASSET';

/**
 * สร้างเลขล็อตอัตโนมัติถ้าไม่มีส่งมา: {YYMMDD}-{4xBASE36}
 * เช่น 250430-K3Z1
 */
const generateLotCode = (receiveDate) => {
    const d = receiveDate ? new Date(receiveDate) : new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const rand = Math.floor(Math.random() * 36 ** 4).toString(36).toUpperCase().padStart(4, '0');
    return `${yy}${mm}${dd}-${rand}`;
};

const createHttpError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

// ── Create Batch ───────────────────────────────────────────────────────────────

const createBatch = async (data, userSession) => {
    const createdById = userSession?.sub || null;
    const batchPayload = DTO.createReceiveBatchDTO(data, createdById);

    return receiveRepo.withTransaction(async (tx) => {
        const batch = await receiveRepo.createReceiveBatch(batchPayload, tx);
        const fullBatch = await receiveRepo.SelectBatchById(batch.id, tx);
        return DTO.mapReceiveBatchResponse(fullBatch);
    });
};

// ── Create Header ──────────────────────────────────────────────────────────────

const createReceive = async (data, userSession) => {
    const createdById = userSession?.sub || null;
    const createdByName = userSession?.email || createdById || 'SYSTEM';

    return receiveRepo.withTransaction(async (tx) => {
        const headerPayload = DTO.createReceiveHeaderDTO(data, createdById);
        const header = await receiveRepo.createReceiveHeader(headerPayload, tx);

        // Resolve lot_code ก่อน build payload — ถ้าไม่มีส่งมา generate ให้อัตโนมัติ
        const itemsWithLot = (data.items || []).map((item) => ({
            ...item,
            lot_code: item.lot_code || generateLotCode(data.receive_date),
        }));

        const receiveItemsPayload = DTO.createReceiveItemsDTO(itemsWithLot, header.id);
        await receiveRepo.createReceiveItems(receiveItemsPayload, tx);

        if (header.status === RECEIVE_STATUS.COMPLETED) {
            if (header.type === ASSET_TYPE) {
                let purchaseDateForAssets = null;
                if (header.batch_id) {
                    const batchRow = await receiveRepo.SelectBatchById(header.batch_id, tx);
                    purchaseDateForAssets = batchRow?.receive_date || null;
                }

                const createdItems = await receiveRepo.selectReceiveItemsByHeader(header.id, tx);
                const deptByItemId = new Map(
                    (data.items || []).map((it) => [it.item_id, it.department_id || null])
                );
                const noteByItemId = new Map(
                    (data.items || []).map((it) => [it.item_id, it.note || null])
                );

                for (const ri of createdItems) {
                    const line = receiveItemsPayload.find((p) => p.item_id === ri.item_id);
                    const qty = Number(line?.qty || 0);
                    const deptId = deptByItemId.get(ri.item_id) || null;
                    const note = noteByItemId.get(ri.item_id) || null;
                    const warrantyExpire = line?.expired_at || null;

                    for (let u = 0; u < qty; u++) {
                        const assetCode = await assetRepo.generateAssetCode(tx);
                        await assetRepo.createAsset(
                            {
                                asset_code: assetCode,
                                item_id: ri.item_id,
                                receive_item_id: ri.id,
                                serial_no: null,
                                department_id: deptId,
                                status: 'READY',
                                note,
                                purchase_date: purchaseDateForAssets,
                                warranty_expire: warrantyExpire,
                            },
                            tx
                        );
                    }

                    if (qty > 0) {
                        const totalAfter = await assetRepo.countTotalAssetsByItemId(ri.item_id, tx);
                        const totalBefore = totalAfter - qty;
                        await stockMovementRepo.createStockMovement({
                            item_id: ri.item_id,
                            lot_id: null,
                            quantity: qty,
                            type: 'RECEIVE_IN',
                            note: `[รับเข้า] ครุภัณฑ์ ${qty} ชิ้น | ใบ ${header.doc_no || ''}`,
                            created_by: createdByName,
                            created_by_id: createdById,
                            balance_before: totalBefore,
                            balance_after: totalAfter,
                        }, tx);
                    }
                }
            } else {
                for (const item of receiveItemsPayload) {
                    const balanceBefore = await stockMovementRepo.fetchItemCurrentStock(item.item_id, tx);
                    const qty = Number(item.qty);

                    if (qty <= 0) continue;

                    const lotUpsertPayload = DTO.createLotUpsertDTO(item);
                    const lot = await lotRepo.upsertItemLot(
                        {
                            where: lotUpsertPayload.where,
                            update: lotUpsertPayload.update,
                            create: lotUpsertPayload.create,
                        },
                        tx
                    );

                    const stockMovementPayload = DTO.createStockMovementDTO(
                        item,
                        data.doc_no,
                        createdByName,
                        createdById,
                        lot.id,
                        balanceBefore,
                        balanceBefore + qty
                    );
                    await stockMovementRepo.createStockMovement(stockMovementPayload, tx);
                }
            }
        }

        const createdHeader = await receiveRepo.SelectReceiveById(header.id, tx);
        return DTO.mapReceiveBatchHeaderResponse(createdHeader);
    });
};

// ── List Batches ───────────────────────────────────────────────────────────────

const getReceives = async ({
    page = 1,
    limit = 10,
    keyword = '',
    type = '',
    status = '',
    start_date = '',
    end_date = '',
} = {}) => {
    const [items, total] = await receiveRepo.SelectAllBatches({
        page, limit, keyword, type, status, start_date, end_date,
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
        items: items.map(DTO.mapReceiveBatchResponse),
        total,
        page,
        limit,
        totalPages,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null,
    };
};

// ── Get Single Batch ───────────────────────────────────────────────────────────

const getBatchById = async (batchId) => {
    const batch = await receiveRepo.SelectBatchById(batchId);
    if (!batch) {
        throw createHttpError(404, 'Receive batch not found');
    }
    return DTO.mapReceiveBatchResponse(batch);
};

// ── Cancel Header ──────────────────────────────────────────────────────────────

const cancelReceive = async (headerId, userSession, reason = '') => {
    const updatedById = userSession?.sub || null;
    const updatedByName = userSession?.email || updatedById || 'SYSTEM';

    return receiveRepo.withTransaction(async (tx) => {
        const header = await receiveRepo.SelectReceiveById(headerId, tx);
        if (!header) {
            throw createHttpError(404, 'Receive document not found');
        }

        if (header.status === RECEIVE_STATUS.CANCELLED) {
            throw createHttpError(400, 'This receive document has already been cancelled');
        }

        const cancelNote = reason?.trim()
            ? `[CANCEL] ${reason.trim()}`
            : '[CANCEL] receive document cancelled';

        if (header.status !== RECEIVE_STATUS.COMPLETED) {
            await receiveRepo.updateReceiveHeader(
                headerId,
                {
                    status: RECEIVE_STATUS.CANCELLED,
                    note: header.note ? `${header.note}\n${cancelNote}` : cancelNote,
                },
                tx
            );

            const cancelledHeader = await receiveRepo.SelectReceiveById(headerId, tx);
            return DTO.mapReceiveBatchHeaderResponse(cancelledHeader);
        }

        for (const receiveItem of header.receive_item) {
            const lot = await lotRepo.selectLotByItemAndCode(receiveItem.item_id, receiveItem.lot_code, tx);
            const lotQty = Number(lot?.quantity || 0);
            const receiveQty = Number(receiveItem.qty || 0);

            if (!lot || lotQty < receiveQty) {
                throw createHttpError(400, 'Cancellation failed: some items have already been issued');
            }
        }

        for (const receiveItem of header.receive_item) {
            const lot = await lotRepo.selectLotByItemAndCode(receiveItem.item_id, receiveItem.lot_code, tx);
            const receiveQty = Number(receiveItem.qty || 0);

            const balanceBefore = await stockMovementRepo.fetchItemCurrentStock(receiveItem.item_id, tx);

            const decremented = await lotRepo.decrementLotQuantitySafe(lot.id, receiveQty, tx);
            if (!decremented.count) {
                throw createHttpError(400, 'Cancellation failed: some items have already been issued');
            }

            const movementPayload = DTO.createCancelStockMovementDTO(
                receiveItem,
                header.doc_no,
                updatedByName,
                updatedById,
                lot.id,
                balanceBefore,
                balanceBefore - receiveQty
            );
            await stockMovementRepo.createStockMovement(movementPayload, tx);
        }

        await receiveRepo.updateReceiveHeader(
            headerId,
            {
                status: RECEIVE_STATUS.CANCELLED,
                note: header.note ? `${header.note}\n${cancelNote}` : cancelNote,
            },
            tx
        );

        const cancelledHeader = await receiveRepo.SelectReceiveById(headerId, tx);
        return DTO.mapReceiveBatchHeaderResponse(cancelledHeader);
    });
};

// ── Confirm Header ─────────────────────────────────────────────────────────────

const confirmReceive = async (headerId, itemsPayload = [], userSession = null) => {
    const updatedById = userSession?.sub || null;
    const updatedByName = userSession?.email || updatedById || 'SYSTEM';

    const header = await receiveRepo.SelectReceiveById(headerId);
    if (!header) {
        throw createHttpError(404, 'Receive document not found');
    }

    if (header.status !== RECEIVE_STATUS.PENDING) {
        throw createHttpError(400, 'Only PENDING receive documents can be confirmed');
    }

    if (!Array.isArray(itemsPayload) || itemsPayload.length === 0) {
        throw createHttpError(400, 'itemsPayload must be a non-empty array');
    }

    return receiveRepo.withTransaction(async (tx) => {
        const currentHeader = await receiveRepo.SelectReceiveById(headerId, tx);
        if (!currentHeader) {
            throw createHttpError(404, 'Receive document not found');
        }

        if (currentHeader.status !== RECEIVE_STATUS.PENDING) {
            throw createHttpError(400, 'Only PENDING receive documents can be confirmed');
        }

        const existingItems = Array.isArray(currentHeader.receive_item) ? currentHeader.receive_item : [];
        if (!existingItems.length) {
            throw createHttpError(400, 'No receive items found for this document');
        }

        let batchReceiveDate = null;
        if (currentHeader.batch_id) {
            const batchRow = await receiveRepo.SelectBatchById(currentHeader.batch_id, tx);
            batchReceiveDate = batchRow?.receive_date || null;
        }

        const existingById = new Map();
        const existingByItemId = new Map();

        for (const dbItem of existingItems) {
            existingById.set(Number(dbItem.id), dbItem);

            if (!existingByItemId.has(dbItem.item_id)) {
                existingByItemId.set(dbItem.item_id, []);
            }
            existingByItemId.get(dbItem.item_id).push(dbItem);
        }

        const matchedReceiveItemIds = new Set();

        for (const payloadItem of itemsPayload) {
            const payloadReceiveItemId = Number(payloadItem?.receive_item_id);
            const payloadItemId = payloadItem?.item_id;

            let existingItem = null;

            if (Number.isInteger(payloadReceiveItemId) && existingById.has(payloadReceiveItemId)) {
                existingItem = existingById.get(payloadReceiveItemId);
            } else if (payloadItemId && existingByItemId.has(payloadItemId)) {
                const candidate = existingByItemId
                    .get(payloadItemId)
                    .find((it) => !matchedReceiveItemIds.has(it.id));
                existingItem = candidate || null;
            }

            if (!existingItem) {
                throw createHttpError(400, 'Some itemsPayload entries do not match existing receive items');
            }

            if (matchedReceiveItemIds.has(existingItem.id)) {
                throw createHttpError(400, 'Duplicate itemsPayload entry for the same receive item');
            }

            matchedReceiveItemIds.add(existingItem.id);

            const actualQty = Number(payloadItem?.qty);
            if (!Number.isInteger(actualQty) || actualQty < 0) {
                throw createHttpError(400, 'qty must be an integer greater than or equal to 0');
            }

            const expectedQty = Number(existingItem.expected_qty || 0);
            if (actualQty > expectedQty) {
                throw createHttpError(
                    400,
                    `actual qty cannot be greater than expected_qty for item_id: ${existingItem.item_id}`
                );
            }

            if (currentHeader.type === ASSET_TYPE) {
                const assetsInput = Array.isArray(payloadItem?.assets) ? payloadItem.assets : [];
                if (actualQty > 0 && assetsInput.length !== actualQty) {
                    throw createHttpError(
                        400,
                        `assets array length must equal qty (${actualQty}) for item_id: ${existingItem.item_id}`
                    );
                }

                const assetWarrantyAt = payloadItem?.expired_at
                    ? new Date(payloadItem.expired_at)
                    : null;
                if (payloadItem?.expired_at && Number.isNaN(assetWarrantyAt.getTime())) {
                    throw createHttpError(
                        400,
                        `invalid expired_at (warranty) for item_id: ${existingItem.item_id}`
                    );
                }
                await tx.receive_item.update({
                    where: { id: existingItem.id },
                    data: {
                        qty: actualQty,
                        expired_at: payloadItem?.expired_at ? assetWarrantyAt : null,
                    },
                });

                for (const assetInput of assetsInput) {
                    const assetCode = await assetRepo.generateAssetCode(tx);
                    await assetRepo.createAsset(
                        {
                            asset_code: assetCode,
                            item_id: existingItem.item_id,
                            receive_item_id: existingItem.id,
                            serial_no: assetInput?.serial_no || null,
                            department_id: assetInput?.department_id || null,
                            status: 'READY',
                            note: assetInput?.note || null,
                            purchase_date: batchReceiveDate,
                            warranty_expire: assetWarrantyAt,
                        },
                        tx
                    );
                }
            } else {
                // ถ้าไม่ส่ง lot_code มา → generate ให้อัตโนมัติ
                const lotCode = payloadItem?.lot_code
                    ? payloadItem.lot_code.toString().trim()
                    : (actualQty > 0 ? generateLotCode(currentHeader.batch?.receive_date) : null);

                const expiredAt = payloadItem?.expired_at ? new Date(payloadItem.expired_at) : null;
                if (payloadItem?.expired_at && Number.isNaN(expiredAt.getTime())) {
                    throw createHttpError(400, `invalid expired_at for item_id: ${existingItem.item_id}`);
                }

                await tx.receive_item.update({
                    where: { id: existingItem.id },
                    data: {
                        qty: actualQty,
                        lot_code: lotCode,
                        expired_at: expiredAt,
                    },
                });

                if (actualQty > 0) {
                    const balanceBefore = await stockMovementRepo.fetchItemCurrentStock(
                        existingItem.item_id,
                        tx
                    );

                    const lotUpsertPayload = DTO.createLotUpsertDTO({
                        item_id: existingItem.item_id,
                        lot_code: lotCode,
                        qty: actualQty,
                        expired_at: payloadItem?.expired_at || null,
                        warehouse_id: payloadItem?.warehouse_id || null,
                    });

                    const lot = await lotRepo.upsertItemLot(
                        {
                            where: lotUpsertPayload.where,
                            update: lotUpsertPayload.update,
                            create: lotUpsertPayload.create,
                        },
                        tx
                    );

                    const stockMovementPayload = DTO.createStockMovementDTO(
                        { item_id: existingItem.item_id, qty: actualQty, lot_code: lotCode },
                        currentHeader.doc_no,
                        updatedByName,
                        updatedById,
                        lot.id,
                        balanceBefore,
                        balanceBefore + actualQty
                    );

                    await stockMovementRepo.createStockMovement(stockMovementPayload, tx);
                }
            }

        }

        if (matchedReceiveItemIds.size !== existingItems.length) {
            throw createHttpError(400, 'itemsPayload must include all receive items in this document');
        }

        await receiveRepo.updateReceiveHeader(
            currentHeader.id,
            { status: RECEIVE_STATUS.COMPLETED },
            tx
        );

        const updatedHeader = await receiveRepo.SelectReceiveById(currentHeader.id, tx);
        return DTO.mapReceiveBatchHeaderResponse(updatedHeader);
    });
};

module.exports = {
    createBatch,
    createReceive,
    getReceives,
    getBatchById,
    cancelReceive,
    confirmReceive,
};
