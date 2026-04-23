// ── Batch ──────────────────────────────────────────────────────────────────────

const createReceiveBatchDTO = (data = {}, createdBy = null) => ({
    batch_no: data.batch_no.toString().trim(),
    acquisition_type: data.acquisition_type.toString().trim(),
    supplier_id: data.supplier_id || null,
    donor_name: data.donor_name || null,
    receive_date: data.receive_date ? new Date(data.receive_date) : new Date(),
    note: data.note || null,
    created_by: createdBy || null,
});

// ── Header ─────────────────────────────────────────────────────────────────────

const createReceiveHeaderDTO = (data = {}, createdBy = null) => ({
    doc_no: data.doc_no.toString().trim(),
    type: data.type.toString().trim(),
    note: data.note || null,
    created_by: createdBy || null,
    status: data.status,
    batch_id: data.batch_id || null,
});

// ── Items / Lots / Movements ───────────────────────────────────────────────────

const createReceiveItemsDTO = (items = [], headerId) => {
    return items.map((item) => ({
        header_id: headerId,
        item_id: item.item_id,
        lot_code: item.lot_code ? item.lot_code.toString().trim() : null,
        qty: Number(item.qty),
        expected_qty: Number(item.expected_qty),
        cost_price: item.cost_price !== undefined ? Number(item.cost_price) : 0,
        expired_at: item.expired_at ? new Date(item.expired_at) : null,
    }));
};

const createLotUpsertDTO = (item = {}) => {
    const qty = Number(item.qty);
    const lotCode = item.lot_code.toString().trim();

    return {
        where: {
            item_id_lot_code: {
                item_id: item.item_id,
                lot_code: lotCode,
            },
        },
        update: {
            quantity: { increment: qty },
            expired_at: item.expired_at ? new Date(item.expired_at) : undefined,
            warehouse_id: item.warehouse_id || undefined,
            status: 'ACTIVE',
            deleted_at: null,
        },
        create: {
            item_id: item.item_id,
            lot_code: lotCode,
            warehouse_id: item.warehouse_id || null,
            quantity: qty,
            status: 'ACTIVE',
            expired_at: item.expired_at ? new Date(item.expired_at) : null,
        },
    };
};

const createStockMovementDTO = (
    item = {},
    docNo = '',
    createdByName = 'SYSTEM',
    createdById = null,
    lotId = null,
    balanceBefore = 0,
    balanceAfter = 0
) => ({
    item_id: item.item_id,
    lot_id: lotId,
    quantity: Number(item.qty),
    type: 'RECEIVE_IN',
    note: `Receive IN: ${docNo}`,
    created_by: createdByName,
    created_by_id: createdById ? createdById.toString().trim() : null,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
});

const createCancelStockMovementDTO = (
    item = {},
    docNo = '',
    createdByName = 'SYSTEM',
    createdById = null,
    lotId = null,
    balanceBefore = 0,
    balanceAfter = 0
) => ({
    item_id: item.item_id,
    lot_id: lotId,
    quantity: Number(item.qty),
    type: 'RECEIVE_CANCEL',
    note: `Cancel Receive: ${docNo}`,
    created_by: createdByName,
    created_by_id: createdById ? createdById.toString().trim() : null,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
});

// ── Query DTOs ─────────────────────────────────────────────────────────────────

const listBatchesQueryDTO = (query = {}) => ({
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(100, Math.max(1, Number(query.limit) || 10)),
    keyword: (query.keyword || '').toString().trim(),
    type: (query.type || '').toString().trim(),
    status: (query.status || '').toString().trim().toUpperCase(),
    start_date: (query.start_date || '').toString().trim(),
    end_date: (query.end_date || '').toString().trim(),
});

// ── Response Mappers ───────────────────────────────────────────────────────────

const formatProfileDisplayName = (p) => {
    if (!p) return null;
    const th = [p.firstname_th, p.lastname_th].filter(Boolean).join(' ').trim();
    if (th) return th;
    const en = [p.firstname_en, p.lastname_en].filter(Boolean).join(' ').trim();
    return en || null;
};

const mapReceiveItemResponse = (item = {}) => {
    const categoryName = item.items?.categories?.name || null;
    return {
        id: item.id,
        header_id: item.header_id,
        item_id: item.item_id,
        item_code: item.items?.code || null,
        item_name: item.items?.name || null,
        category: categoryName,
        category_name: categoryName,
        lot_code: item.lot_code,
        expected_qty: item.expected_qty,
        qty: item.qty,
        cost_price: item.cost_price,
        expired_at: item.expired_at,
    };
};

const mapReceiveBatchHeaderResponse = (header = {}) => ({
    id: header.id,
    doc_no: header.doc_no,
    type: header.type,
    status: header.status,
    note: header.note,
    batch_id: header.batch_id,
    created_by: header.created_by,
    created_at: header.created_at,
    updated_at: header.updated_at,
    receive_item: Array.isArray(header.receive_item)
        ? header.receive_item.map(mapReceiveItemResponse)
        : [],
});

const mapReceiveBatchResponse = (batch = {}) => ({
    id: batch.id,
    batch_no: batch.batch_no,
    acquisition_type: batch.acquisition_type,
    supplier_id: batch.supplier_id,
    supplier_name: batch.supplier?.name || null,
    donor_name: batch.donor_name,
    receive_date: batch.receive_date,
    note: batch.note,
    created_by: batch.created_by,
    created_by_name: formatProfileDisplayName(batch.profiles) || null,
    created_at: batch.created_at,
    updated_at: batch.updated_at,
    headers: Array.isArray(batch.receive_header)
        ? batch.receive_header.map(mapReceiveBatchHeaderResponse)
        : [],
});

module.exports = {
    createReceiveBatchDTO,
    createReceiveHeaderDTO,
    createReceiveItemsDTO,
    createLotUpsertDTO,
    createStockMovementDTO,
    createCancelStockMovementDTO,
    listBatchesQueryDTO,
    mapReceiveBatchResponse,
    mapReceiveBatchHeaderResponse,
    mapReceiveItemResponse,
};
