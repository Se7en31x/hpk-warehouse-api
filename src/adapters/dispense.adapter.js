/**
 * Dispense Adapter
 * ส่งข้อมูล stock ที่ตัดออกจากคลังหลักไปยัง HMS Dispense system
 * Target: POST https://api-dispense.hpk-hms.site/api/stock/from-main
 */

const { resolveDispenseQty } = require('../utils/unitConverter');

const DISPENSE_API_URL =
    process.env.DISPENSE_API_URL || 'https://api-dispense.hpk-hms.site/api/stock/from-main';

const MEDICINE_CATEGORY_ID = '93b17a8b-c934-46ee-96fc-bd7697b94874';

/**
 * ส่งรายการยาทั้งหมดของใบเบิกไปยัง HMS Dispense ในครั้งเดียว (array body)
 * เรียกแบบ fire-and-forget หลัง completeDelivery สำเร็จ
 *
 * เงื่อนไขที่จะส่ง:
 *  1. DISPENSE_TARGET_DEPT_ID ต้องถูก set ใน .env
 *  2. header.department_id ต้องตรงกับ DISPENSE_TARGET_DEPT_ID
 *  3. มีรายการยา (category_id = MEDICINE_CATEGORY_ID) อย่างน้อย 1 รายการ
 *
 * @param {object} header - raw Prisma object จาก SelectRequisitionById
 */
const fireDispenseAdapter = async (header) => {
    const targetDeptId = process.env.DISPENSE_TARGET_DEPT_ID
        ? parseInt(process.env.DISPENSE_TARGET_DEPT_ID, 10)
        : null;

    if (!targetDeptId) {
        console.warn('[dispense.adapter] DISPENSE_TARGET_DEPT_ID ไม่ได้ set — ข้ามการส่งข้อมูล');
        return;
    }

    if (header.department_id !== targetDeptId) {
        return; // ไม่ใช่ห้องจ่ายยา ไม่ต้องส่ง
    }

    const itemsArray = [];

    for (const reqItem of header.requisition_item || []) {
        const item = reqItem.items;
        if (!item || item.category_id !== MEDICINE_CATEGORY_ID) continue;

        const unitName = item.unit?.name || '';

        for (const alloc of reqItem.item_allocation || []) {
            const { convertedQty } = resolveDispenseQty(unitName, alloc.qty || 0);
            const lot = alloc.item_lot;

            itemsArray.push({
                item_id:     item.id,
                quantity:    convertedQty,
                lot_number:  lot?.lot_code ?? null,
                expiry_date: lot?.expired_at
                    ? new Date(lot.expired_at).toISOString().split('T')[0]
                    : null,
                mfg_date:    null,
            });
        }
    }

    if (itemsArray.length === 0) {
        console.log('[dispense.adapter] ไม่มีรายการยาในใบเบิกนี้ — ข้ามการส่งข้อมูล');
        return;
    }

    let response;
    try {
        response = await fetch(DISPENSE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reference_no: header.doc_no,
                source_type:  'main_warehouse',
                items:        itemsArray,
            }),
        });
    } catch (networkErr) {
        throw new Error(`[dispense.adapter] network error: ${networkErr.message}`);
    }

    let body;
    try {
        body = await response.json();
    } catch {
        body = null;
    }

    if (!response.ok) {
        throw new Error(
            `[dispense.adapter] responded ${response.status}: ${JSON.stringify(body)}`
        );
    }

    console.log(`[dispense.adapter] ส่งรายการยา ${itemsArray.length} รายการ สำเร็จ (ref: ${header.doc_no})`);
    return body;
};

module.exports = { fireDispenseAdapter };
