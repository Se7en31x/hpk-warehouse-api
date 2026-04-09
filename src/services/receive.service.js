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

const createHttpError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const createReceive = async (data, userSession) => {
    const createdById = userSession?.user_id || null;
    const createdByName = userSession?.user_fullname || createdById || 'SYSTEM';

    return receiveRepo.withTransaction(async (tx) => {
        const headerPayload = DTO.createReceiveHeaderDTO(data, createdById);
        const header = await receiveRepo.createReceiveHeader(headerPayload, tx);

        const receiveItemsPayload = DTO.createReceiveItemsDTO(data.items, header.id);
        await receiveRepo.createReceiveItems(receiveItemsPayload, tx);

        if (header.status === RECEIVE_STATUS.COMPLETED) {
            for (const item of receiveItemsPayload) {
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
                    lot.id
                );
                await stockMovementRepo.createStockMovement(stockMovementPayload, tx);
            }
        }

        const createdHeader = await receiveRepo.SelectReceiveById(header.id, tx);
        return DTO.mapReceiveHeaderResponse(createdHeader);
    });
};

const getReceives = async ({ page = 1, limit = 10, keyword = '', type = '', status = '', start_date = '', end_date = '' } = {}) => {
    const [items, total] = await receiveRepo.SelectAllReceives({
        page,
        limit,
        keyword,
        type,
        status,
        start_date,
        end_date,
    });

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
        items: items.map(DTO.mapReceiveHeaderResponse),
        total,
        page,
        limit,
        totalPages,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null,
    };
};

const getReceiveById = async (headerId) => {
    const header = await receiveRepo.SelectReceiveById(headerId);
    if (!header) {
        throw createHttpError(404, 'Receive document not found');
    }

    return DTO.mapReceiveHeaderResponse(header);
};

const cancelReceive = async (headerId, userSession, reason = '') => {
    const updatedById = userSession?.user_id || null;
    const updatedByName = userSession?.user_fullname || updatedById || 'SYSTEM';

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
            return DTO.mapReceiveHeaderResponse(cancelledHeader);
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

            const decremented = await lotRepo.decrementLotQuantitySafe(lot.id, receiveQty, tx);
            if (!decremented.count) {
                throw createHttpError(400, 'Cancellation failed: some items have already been issued');
            }

            const movementPayload = DTO.createCancelStockMovementDTO(
                receiveItem,
                header.doc_no,
                updatedByName,
                updatedById,
                lot.id
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
        return DTO.mapReceiveHeaderResponse(cancelledHeader);
    });
};

const confirmReceive = async (headerId, itemsPayload = [], userSession = null) => {
    const updatedById = userSession?.user_id || null;
    const updatedByName = userSession?.user_fullname || updatedById || 'SYSTEM';

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
        const backorderItems = [];

        for (const payloadItem of itemsPayload) {
            const payloadReceiveItemId = Number(payloadItem?.receive_item_id);
            const payloadItemId = payloadItem?.item_id;

            let existingItem = null;

            if (Number.isInteger(payloadReceiveItemId) && existingById.has(payloadReceiveItemId)) {
                existingItem = existingById.get(payloadReceiveItemId);
            } else if (payloadItemId && existingByItemId.has(payloadItemId)) {
                const candidate = existingByItemId.get(payloadItemId).find((it) => !matchedReceiveItemIds.has(it.id));
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
                // --- ASSET branch: สร้าง medical_assets รายชิ้น ไม่มี lot/stock movement ---
                const assetsInput = Array.isArray(payloadItem?.assets) ? payloadItem.assets : [];
                if (actualQty > 0 && assetsInput.length !== actualQty) {
                    throw createHttpError(
                        400,
                        `assets array length must equal qty (${actualQty}) for item_id: ${existingItem.item_id}`
                    );
                }

                await tx.receive_item.update({
                    where: { id: existingItem.id },
                    data: { qty: actualQty },
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
                        },
                        tx
                    );
                }
            } else {
                // --- STOCK branch: lot + stock movement (เดิม) ---
                const lotCode = payloadItem?.lot_code ? payloadItem.lot_code.toString().trim() : null;
                if (actualQty > 0 && !lotCode) {
                    throw createHttpError(
                        400,
                        `lot_code is required when actual qty is greater than 0 for item_id: ${existingItem.item_id}`
                    );
                }

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
                        {
                            item_id: existingItem.item_id,
                            qty: actualQty,
                        },
                        currentHeader.doc_no,
                        updatedByName,
                        updatedById,
                        lot.id
                    );

                    await stockMovementRepo.createStockMovement(stockMovementPayload, tx);
                }
            }

            const missingQty = expectedQty - actualQty;
            if (missingQty > 0) {
                backorderItems.push({
                    item_id: existingItem.item_id,
                    expected_qty: missingQty,
                    qty: 0,
                    lot_code: null,
                    cost_price:
                        existingItem.cost_price !== null && existingItem.cost_price !== undefined
                            ? Number(existingItem.cost_price)
                            : 0,
                    expired_at: null,
                });
            }
        }

        if (matchedReceiveItemIds.size !== existingItems.length) {
            throw createHttpError(400, 'itemsPayload must include all receive items in this document');
        }

        // Asset type ไม่สร้าง backorder
        if (backorderItems.length > 0 && currentHeader.type !== ASSET_TYPE) {
            const baseBackorderDocNo = `${currentHeader.doc_no}-B`;
            const existingBackorderCount = await tx.receive_header.count({
                where: {
                    OR: [
                        { doc_no: baseBackorderDocNo },
                        { doc_no: { startsWith: `${baseBackorderDocNo}-` } },
                    ],
                },
            });

            const backorderDocNo =
                existingBackorderCount === 0
                    ? baseBackorderDocNo
                    : `${baseBackorderDocNo}-${String(existingBackorderCount + 1)}`;

            const backorderHeader = await receiveRepo.createReceiveHeader(
                {
                    doc_no: backorderDocNo,
                    type: currentHeader.type,
                    status: RECEIVE_STATUS.PENDING,
                    supplier_id: currentHeader.supplier_id || null,
                    donor_name: currentHeader.donor_name || null,
                    receive_date: new Date(),
                    note: `Auto-generated backorder from ${currentHeader.doc_no}`,
                    created_by: updatedById,
                    parent_id: currentHeader.id,
                },
                tx
            );

            const backorderItemsPayload = DTO.createReceiveItemsDTO(backorderItems, backorderHeader.id);
            await receiveRepo.createReceiveItems(backorderItemsPayload, tx);
        } // end backorder block

        await receiveRepo.updateReceiveHeader(
            currentHeader.id,
            { status: RECEIVE_STATUS.COMPLETED },
            tx
        );

        const updatedHeader = await receiveRepo.SelectReceiveById(currentHeader.id, tx);
        return DTO.mapReceiveHeaderResponse(updatedHeader);
    });
};

module.exports = {
    createReceive,
    getReceives,
    getReceiveById,
    cancelReceive,
    confirmReceive,
};
