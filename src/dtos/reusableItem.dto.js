const RECEIVE_TYPE = 'REUSABLE_UNIT';

/**
 * 📥 [QUERY DTO] สำหรับกรองรายการ Reusable Units
 */
const listReusableUnitsQueryDTO = (query = {}) => ({
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(100, Math.max(1, Number(query.limit) || 10)),
    keyword: (query.keyword || '').toString().trim(),
    item_id: (query.item_id || '').toString().trim(),
    // แก้ไข: แปลงเป็น Number เพื่อรองรับ Int ใน DB
    department_id: query.department_id ? Number(query.department_id) : null,
    status: (query.status || '').toString().trim().toUpperCase(),
});

/**
 * 📥 [QUERY DTO] สำหรับกรองรายการ Return Requests
 */
const listReturnRequestsQueryDTO = (query = {}) => ({
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(100, Math.max(1, Number(query.limit) || 10)),
    keyword: (query.keyword || '').toString().trim(),
    // แก้ไข: แปลงเป็น Number
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

/**
 * 📤 [RESPONSE MAPPER] สำหรับ Reusable Unit (รายชิ้น)
 */
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
    item_image_url: unit.items?.image_url || null,
    receive_item_id: unit.receive_item_id || null,
    receive_doc_no: unit.receive_item?.receive_header?.doc_no || null,
    serial_no: unit.serial_no || null,
    // แก้ไข: Map ข้อมูลแผนก
    department_id: unit.department_id || null,
    department_name: unit.departments?.name || null, 
    status: unit.status,
    condition: unit.condition,
    note: unit.note || null,
    created_at: unit.created_at,
    updated_at: unit.updated_at,
});

const parseAttachmentList = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

/**
 * 📤 [RESPONSE MAPPER] สำหรับคำขอคืน (Return Request)
 */
const mapReturnRequestResponse = (request = {}) => ({
    id: request.id,
    doc_no: request.doc_no,
    department_id: request.department_id,
    department_name: request.departments?.name || null, 
    preferred_pickup_at: request.preferred_pickup_at || null,
    requested_by: request.requested_by || null,
    requested_by_name: [
        request.profiles?.firstname_th,
        request.profiles?.lastname_th,
    ].filter(Boolean).join(' ') || null,
    status: request.status,
    note: request.note || null,
    created_at: request.created_at,
    updated_at: request.updated_at,
    items: (request.request_items || []).map((item) => ({
        id: item.id,
        item_id: item.item_id,
        item_code: item.items?.code || null,
        item_name: item.items?.name || null,
        item_image_url: item.items?.image_url || null,
        item_unit_name: item.items?.unit?.name || null,
        category_name: item.items?.categories?.name || null,
        requested_qty: item.requested_qty,
        note: item.note || null,
        requested_unit_codes: parseRequestedUnitCodes(item.note),
    })),
    submit_attachments: parseAttachmentList(request.submit_attachments),
    process_attachments: parseAttachmentList(request.process_attachments),
});

module.exports = {
    RECEIVE_TYPE,
    listReusableUnitsQueryDTO,
    listReturnRequestsQueryDTO,
    mapReusableUnitResponse,
    mapReturnRequestResponse,
};