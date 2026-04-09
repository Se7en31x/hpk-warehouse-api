/**
 * 📥 [INPUT] สำหรับเตรียมข้อมูล Header ก่อนบันทึก
 */
const createHeaderDTO = (data, docNo, createdById, borrowerId) => ({
    doc_no: docNo,
    type: data.type,
    department_id: data.department_id ? Number(data.department_id) : null,
    status: data.status || 'PENDING',
    request_date: data.request_date ? new Date(data.request_date) : new Date(),
    due_date: data.due_date ? new Date(data.due_date) : null,
    requester_id: createdById,
    borrower_id: borrowerId || null,
    note: data.note || null,
});

/**
 * 📥 [INPUT] สำหรับเตรียมรายการสินค้าก่อนบันทึก
 */
const createItemsDTO = (items, headerId) => {
    if (!Array.isArray(items)) return [];
    return items.map(item => ({
        header_id: headerId,
        item_id: item.item_id,
        req_qty: Number(item.qty || 0),
        approved_qty: 0,
        issued_qty: 0,
        returned_qty: 0,
        note: item.note || '',
    }));
};

/**
 * 📤 [OUTPUT - LIST] สำหรับหน้าตาราง (เบาและเร็ว)
 */
const mapRequisitionListResponse = (data) => {
    if (!data) return null;
    return {
        id: data.id,
        doc_no: data.doc_no,
        type: data.type,
        status: data.status,
        request_date: data.request_date,
        due_date: data.due_date || null,
        department_id: data.department_id,
        requester_id: data.requester_id,
        requester: [
            data.profiles_requisition_header_requester_idToprofiles?.firstname_th,
            data.profiles_requisition_header_requester_idToprofiles?.lastname_th,
        ].filter(Boolean).join(' ') || 'N/A',
        item_count: data._count?.requisition_item || 0,
        note: data.note,
        borrower_details: data.borrower_details || null,
    };
};

/**
 * 📤 [OUTPUT - DETAIL] สำหรับหน้า Modal (ข้อมูลครบถ้วน)
 */
const mapRequisitionDetailResponse = (data) => {
    if (!data) return null;
    return {
        ...mapRequisitionListResponse(data),
        // ✅ ยุบชั้นข้อมูลสินค้าให้หน้าบ้านเรียก row.name ได้เลย
        items: (data.requisition_item || []).map(ri => ({
            itemType: ri.items?.type || 'CONSUMABLE',
            id: ri.id,
            item_id: ri.item_id,
            name: ri.items?.name || 'Unknown',
            code: ri.items?.code || '',
            image_url: ri.items?.image_url || null,
            qty: ri.req_qty || 0,
            current_stock: ri.items?.current_stock || 0,
            available_stock:
                (ri.items?.type || '').toString().toUpperCase() === 'REUSABLE'
                    ? Number(ri.items?._count?.reusable_item_units || 0)
                    : Number(ri.items?.current_stock || 0),
            approved: ri.approved_qty || 0,
            issued: ri.issued_qty || 0,
            returned: ri.returned_qty || 0,
            note: ri.note || ''
        })),
        borrower_details: data.borrower_details || null
    };
};

module.exports = {
    createHeaderDTO,
    createItemsDTO,
    mapRequisitionListResponse,
    mapRequisitionDetailResponse
};