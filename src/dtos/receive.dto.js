const createReceiveHeaderDTO = (data = {}, createdBy = null) => ({
    doc_no: data.doc_no.toString().trim(),
    type: data.type.toString().trim(),
    supplier_id: data.supplier_id || null,
    donor_name: data.donor_name || null,
    receive_date: data.receive_date ? new Date(data.receive_date) : new Date(),
    note: data.note || null,
    created_by: createdBy || null,
    status: data.status,
});

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

const createStockMovementDTO = (item = {}, docNo = '', createdByName = 'SYSTEM', createdById = null, lotId = null) => ({
    item_id: item.item_id,
    lot_id: lotId,
    quantity: Number(item.qty),
    type: 'RECEIVE_IN',
    note: `Receive IN: ${docNo}`,
    created_by: createdByName,
    created_by_id: createdById ? createdById.toString().trim() : null,
});

const createCancelStockMovementDTO = (item = {}, docNo = '', createdByName = 'SYSTEM', createdById = null, lotId = null) => ({
    item_id: item.item_id,
    lot_id: lotId,
    quantity: Number(item.qty),
    type: 'RECEIVE_CANCEL',
    note: `Cancel Receive: ${docNo}`,
    created_by: createdByName,
    created_by_id: createdById ? createdById.toString().trim() : null,
});

const listReceivesQueryDTO = (query = {}) => ({
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(100, Math.max(1, Number(query.limit) || 10)),
    keyword: (query.keyword || '').toString().trim(),
    type: (query.type || '').toString().trim(),
    status: (query.status || '').toString().trim().toUpperCase(),
    start_date: (query.start_date || '').toString().trim(),
    end_date: (query.end_date || '').toString().trim(),
});

const mapReceiveItemResponse = (item = {}) => ({
    id: item.id,
    header_id: item.header_id,
    item_id: item.item_id,
    item_code: item.items?.code || null,
    item_name: item.items?.name || null,
    lot_code: item.lot_code,
    expected_qty: item.expected_qty,
    qty: item.qty,
    cost_price: item.cost_price,
    expired_at: item.expired_at,
});

const mapReceiveHeaderResponse = (header = {}) => ({
    id: header.id,
    doc_no: header.doc_no,
    type: header.type,
    status: header.status,
    supplier_id: header.supplier_id,
    supplier_name: header.supplier?.name || null,
    donor_name: header.donor_name,
    receive_date: header.receive_date,
    note: header.note,
    created_by: header.created_by,
    created_at: header.created_at,
    updated_at: header.updated_at,
    receive_item: Array.isArray(header.receive_item)
        ? header.receive_item.map(mapReceiveItemResponse)
        : [],
});

module.exports = {
    createReceiveHeaderDTO,
    createReceiveItemsDTO,
    createLotUpsertDTO,
    createStockMovementDTO,
    createCancelStockMovementDTO,
    listReceivesQueryDTO,
    mapReceiveHeaderResponse,
};
