const RECEIVE_TYPE = 'REUSABLE_UNIT';

const listReusableUnitsQueryDTO = (query = {}) => ({
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(100, Math.max(1, Number(query.limit) || 10)),
    keyword: (query.keyword || '').toString().trim(),
    item_id: (query.item_id || '').toString().trim(),
    department_id: query.department_id ? Number(query.department_id) : null,
    status: (query.status || '').toString().trim().toUpperCase(),
});

const listReturnRequestsQueryDTO = (query = {}) => ({
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(100, Math.max(1, Number(query.limit) || 10)),
    keyword: (query.keyword || '').toString().trim(),
    department_id: query.department_id ? Number(query.department_id) : null,
    status: (query.status || '').toString().trim().toUpperCase(),
});

const parseRequestedUnitCodes = (note = '') => {
    const raw = (note || '').toString().trim();
    if (!raw.toUpperCase().startsWith('UNITS:')) return [];

    return Array.from(
        new Set(
            raw
                .slice(6)
                .split(',')
                .map((code) => code.toString().trim())
                .filter(Boolean)
        )
    );
};

const mapReusableUnitResponse = (unit = {}) => ({
    usage_context:
        unit.movement_logs?.[0]?.action === 'ISSUE_BORROW_REUSABLE'
            ? 'BORROW'
            : unit.movement_logs?.[0]?.action === 'ISSUE_WITHDRAW_REUSABLE'
                ? 'WITHDRAW'
                : unit.movement_logs?.[0]?.action === 'ISSUE_REUSABLE'
                    ? (unit.movement_logs?.[0]?.ref_doc_no || '').toString().toUpperCase().startsWith('BOR-')
                        ? 'BORROW'
                        : (unit.movement_logs?.[0]?.ref_doc_no || '').toString().toUpperCase().startsWith('REQ-')
                            ? 'WITHDRAW'
                            : null
                    : null,
    id: unit.id,
    unit_code: unit.unit_code,
    item_id: unit.item_id,
    item_code: unit.items?.code || null,
    item_name: unit.items?.name || null,
    receive_item_id: unit.receive_item_id || null,
    receive_doc_no: unit.receive_item?.receive_header?.doc_no || null,
    serial_no: unit.serial_no || null,
    department_id: unit.department_id || null,
    department_name: unit.departments?.name || null,
    status: unit.status,
    condition: unit.condition,
    note: unit.note || null,
    created_at: unit.created_at,
    updated_at: unit.updated_at,
});

const mapReturnRequestResponse = (request = {}) => ({
    id: request.id,
    doc_no: request.doc_no,
    department_id: request.department_id,
    department_name: request.departments?.name || null,
    preferred_pickup_at: request.preferred_pickup_at || null,
    contact_name: request.contact_name || null,
    contact_phone: request.contact_phone || null,
    status: request.status,
    note: request.note || null,
    created_at: request.created_at,
    updated_at: request.updated_at,
    items: (request.request_items || []).map((item) => ({
        id: item.id,
        item_id: item.item_id,
        item_code: item.items?.code || null,
        item_name: item.items?.name || null,
        requested_qty: item.requested_qty,
        note: item.note || null,
        requested_unit_codes: parseRequestedUnitCodes(item.note),
    })),
});

module.exports = {
    RECEIVE_TYPE,
    listReusableUnitsQueryDTO,
    listReturnRequestsQueryDTO,
    mapReusableUnitResponse,
    mapReturnRequestResponse,
};
