const DTO = require('../dtos/requisition.dto');
const requisitionRepo = require('../repositories/requisition.repo');
const stockMovementRepo = require('../repositories/stockmovement.repo');
const lotRepo = require('../repositories/lot.repo');

const REQ_STATUS = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    COMPLETED: 'COMPLETED',
    BORROWING: 'BORROWING',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
};

const ITEM_TYPE = {
    CONSUMABLE: 'CONSUMABLE',
    REUSABLE: 'REUSABLE',
    MED_ASSET: 'MED_ASSET',
    ASSET: 'ASSET',
};

/**
 * Helper สำหรับสร้าง Error Object
 */
const createHttpError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const normalizeItemType = (type) => {
    const normalized = (type || '').toString().trim().toUpperCase();
    return normalized || ITEM_TYPE.CONSUMABLE;
};

const getReusableReturnState = (condition = 'GOOD') => {
    const normalizedCondition = (condition || 'GOOD').toString().trim().toUpperCase();

    if (normalizedCondition === 'LOST') {
        return { status: 'DISPOSED', condition: 'LOST' };
    }
    if (normalizedCondition === 'DAMAGED' || normalizedCondition === 'INCOMPLETE') {
        return { status: 'REPAIR', condition: normalizedCondition };
    }

    return { status: 'AVAILABLE', condition: 'GOOD' };
};

/**
 * 1. สร้างใบเบิก/ยืมพัสดุ
 */
const createRequisition = async (data, userSession) => {
    const MOCK_USER_ID = "34120bd0-20a9-460c-a3bc-a2348b530552";
    const createdById = userSession?.user_id || MOCK_USER_ID;
    const createdByName = userSession?.user_fullname || createdById || 'SYSTEM';

    if (!data.items?.length) {
        throw createHttpError(400, 'ต้องระบุรายการสินค้าอย่างน้อย 1 รายการ');
    }

    return requisitionRepo.withTransaction(async (tx) => {
        const requestType = (data.type || '').toString().trim().toUpperCase();
        const requestedItemIds = (data.items || []).map((item) => item.item_id).filter(Boolean);
        const itemsFromDb = await requisitionRepo.selectItemsForRequisition(requestedItemIds, tx);
        const itemMap = new Map(itemsFromDb.map((item) => [item.id, item]));

        for (const reqItem of data.items) {
            const dbItem = itemMap.get(reqItem.item_id);
            if (!dbItem) {
                throw createHttpError(404, `ไม่พบสินค้า item_id: ${reqItem.item_id}`);
            }
            if ((dbItem.status || '').toUpperCase() !== 'ACTIVE') {
                throw createHttpError(400, `สินค้า ${dbItem.name} ไม่อยู่ในสถานะพร้อมใช้งาน`);
            }
        }

        if (requestType === 'BORROW') {
            for (const reqItem of data.items) {
                const dbItem = itemMap.get(reqItem.item_id);
                const itemType = normalizeItemType(dbItem?.type);

                if (!dbItem?.allowed_borrow) {
                    throw createHttpError(400, `สินค้า ${dbItem?.name || reqItem.item_id} ไม่ได้เปิดให้ยืม`);
                }
                if (itemType !== ITEM_TYPE.REUSABLE) {
                    throw createHttpError(400, `สินค้า ${dbItem?.name || reqItem.item_id} ไม่ใช่ประเภทของใช้ซ้ำ (REUSABLE)`);
                }
            }
        }

        // สร้างเลขที่เอกสาร (เช่น REQ-20260401-001)
        const newDocNo = await requisitionRepo.generateDocNo(data.type, tx);

        // จัดการข้อมูลผู้ยืม (กรณีประเภท BORROW)
        let borrowerId = null;
        if (data.type === 'BORROW' && data.borrower) {
            const borrower = await requisitionRepo.createBorrowerDetails(data.borrower, tx);
            borrowerId = borrower.id;
        }

        // สร้าง Header
        const headerPayload = DTO.createHeaderDTO(data, newDocNo, createdById, borrowerId);
        const header = await requisitionRepo.createHeader(headerPayload, tx);

        // สร้างรายการสินค้าในใบเบิก
        const itemsPayload = DTO.createItemsDTO(data.items, header.id);
        await requisitionRepo.createItems(itemsPayload, tx);

        // บันทึก Log
        await requisitionRepo.createLogTransaction({
            action: data.type === 'BORROW' ? 'CREATE_BORROW' : 'CREATE_REQUISITION',
            module: "WAREHOUSE",
            code: newDocNo,
            description: `สร้างใบ${data.type === 'BORROW' ? 'ยืม' : 'เบิก'} เลขที่ ${newDocNo}`,
            status: "SUCCESS",
            created_by: createdByName,
            created_by_id: createdById,
        }, tx);

        const createdHeader = await requisitionRepo.SelectRequisitionById(header.id, tx);
        return DTO.mapRequisitionDetailResponse(createdHeader);
    });
};

/**
 * 2. ดึงข้อมูลทั้งหมด (ชื่อตรงกับ Controller: getAllRequisitions)
 */
const getAllRequisitions = async ({
    page = 1,
    limit = 10,
    keyword = '',
    type = '',
    status = '',
    start_date = '',
    end_date = ''
} = {}) => {
    const result = await requisitionRepo.SelectAllRequisitions({
        page: Number(page),
        limit: Number(limit),
        keyword,
        type,
        status,
        start_date,
        end_date,
    });

    const totalPages = Math.max(1, Math.ceil(result.total / limit));

    return {
        items: (result.items || []).map(DTO.mapRequisitionListResponse),
        total: result.total,
        page: Number(page),
        limit: Number(limit),
        totalPages,
    };
};

/**
 * 3. ดึงข้อมูลรายใบ (เพิ่มข้อมูล Lot และ Unit ที่ว่างให้หน้าบ้าน)
 */
const getRequisitionDetail = async (headerId) => {
    const header = await requisitionRepo.SelectRequisitionById(headerId);
    if (!header) throw createHttpError(404, 'ไม่พบใบเบิกที่ระบุ');
    
    const mapped = DTO.mapRequisitionDetailResponse(header);

    // ฝังข้อมูล Options ให้หน้าบ้านเลือก
    for (let i = 0; i < mapped.items.length; i++) {
        const item = mapped.items[i];
        if (item.itemType === 'REUSABLE') {
            const units = await requisitionRepo.selectAvailableReusableUnitsByItem(item.item_id, 99999);
            item.available_units = units.map(u => ({
                id: u.id,
                unit_code: u.unit_code,
            }));
            item.available_lots = [];
        } else {
            const lots = await requisitionRepo.getItemLots(item.item_id);
            item.available_lots = lots.map(l => ({
                id: l.id,
                lot_code: l.lot_code,
                lot_name: l.lot_name,
                quantity: l.quantity,
                expired_at: l.expired_at,
            }));
            item.available_units = [];
        }
    }

    return mapped;
};

/**
 * 4. อนุมัติและตัดสต็อก (FEFO Logic)
 */
const approveRequisition = async (headerId, itemsToIssue, userSession) => {
    const approvedById = userSession?.user_id || null;
    const approvedByName = userSession?.user_fullname || approvedById || 'SYSTEM';

    return requisitionRepo.withTransaction(async (tx) => {
        const header = await requisitionRepo.SelectRequisitionById(headerId, tx);
        if (!header) throw createHttpError(404, 'ไม่พบใบเบิกที่ระบุ');
        if (header.status !== REQ_STATUS.PENDING) {
            throw createHttpError(400, `สถานะปัจจุบันคือ ${header.status} ไม่สามารถอนุมัติได้`);
        }

        let totalQty = 0;
        const reqItemMap = new Map(header.requisition_item.map(item => [item.id, item]));

        for (const [reqItemId, allocationData] of Object.entries(itemsToIssue)) {
            const rItemId = Number(reqItemId);
            
            // รองรับทั้งแบบเก่า (ส่งมาเป็นตัวเลข) และแบบใหม่ (ส่งเป็น Object)
            let qtyNeeded = 0;
            let explicitLots = null;
            let explicitUnits = null;

            if (typeof allocationData === 'object' && allocationData !== null) {
                qtyNeeded = Number(allocationData.qty || 0);
                explicitLots = allocationData.lots || null; // { lot_id: takeQty }
                explicitUnits = allocationData.units || null; // [unit_id_1, unit_id_2]
            } else {
                qtyNeeded = Number(allocationData);
            }
            
            if (qtyNeeded <= 0) continue;

            const currentReqItem = reqItemMap.get(rItemId);
            if (!currentReqItem) throw createHttpError(404, `ไม่พบรายการเบิก ID: ${rItemId}`);

            totalQty += qtyNeeded;

            const itemType = normalizeItemType(currentReqItem.items?.type);

            if (itemType === ITEM_TYPE.REUSABLE) {
                const issueAction = header.type === 'BORROW' ? 'ISSUE_BORROW_REUSABLE' : 'ISSUE_WITHDRAW_REUSABLE';
                let reusableUnits = [];
                
                // ใช้ Unit เฉพาะเจาะจงที่หน้าบ้านส่งมา
                if (explicitUnits && Array.isArray(explicitUnits) && explicitUnits.length > 0) {
                    const allAvailable = await requisitionRepo.selectAvailableReusableUnitsByItem(currentReqItem.item_id, 99999, tx);
                    const availableMap = new Map(allAvailable.map(u => [u.id.toString(), u]));
                    for (const uid of explicitUnits) {
                        const unit = availableMap.get(uid.toString());
                        if (!unit) {
                            throw createHttpError(400, `ครุภัณฑ์ชิ้น ${uid} ของ ${currentReqItem.items.name} ไม่พร้อมใช้งาน`);
                        }
                        reusableUnits.push(unit);
                    }
                    if (reusableUnits.length !== qtyNeeded) {
                       throw createHttpError(400, `ระบุบาร์โค้ดสินค้า ${currentReqItem.items.name} ไม่ครบตามจำนวนเบิก (${reusableUnits.length} / ${qtyNeeded})`);
                    }
                } else {
                    // หากไม่ได้ส่งมา ให้ค้นหาแบบสุ่มให้เหมือนเดิม
                    reusableUnits = await requisitionRepo.selectAvailableReusableUnitsByItem(
                        currentReqItem.item_id,
                        qtyNeeded,
                        tx
                    );
                }

                if ((reusableUnits?.length || 0) < qtyNeeded) {
                    const missing = qtyNeeded - (reusableUnits?.length || 0);
                    throw createHttpError(400, `สินค้า ${currentReqItem.items.name} (ใช้ซ้ำ) ไม่พอ (ขาด ${missing})`);
                }

                for (const unit of reusableUnits) {
                    await requisitionRepo.updateReusableUnitStatus(
                        unit.id,
                        {
                            status: 'IN_USE',
                            department_id: header.department_id || unit.department_id || null,
                            updated_at: new Date(),
                        },
                        tx
                    );

                    await requisitionRepo.createReusableUnitLog(
                        {
                            unit_id: unit.id,
                            action: issueAction,
                            from_department_id: unit.department_id || null,
                            to_department_id: header.department_id || null,
                            ref_doc_no: header.doc_no,
                            note: `REQ_ITEM:${rItemId}`,
                            performed_by: approvedById,
                        },
                        tx
                    );
                }

                await stockMovementRepo.createStockMovement({
                    item_id: currentReqItem.item_id,
                    lot_id: null,
                    quantity: qtyNeeded,
                    type: 'OUT',
                    note: `เบิกจ่ายพัสดุใช้ซ้ำตามใบงาน: ${header.doc_no}`,
                    created_by: approvedByName,
                    created_by_id: approvedById,
                }, tx);

                await requisitionRepo.updateRequisitionItem(rItemId, {
                    issued_qty: qtyNeeded,
                    approved_qty: qtyNeeded,
                }, tx);

                continue;
            }

            // เริ่มกระบวนการตัดรับของ Lot (แบบมี Explicit Allocation หรือ FEFO Auto)
            const lots = await requisitionRepo.getItemLots(currentReqItem.item_id, tx);
            const lotMap = new Map(lots.map(l => [l.id.toString(), l]));
            let remaining = qtyNeeded;

            if (explicitLots && typeof explicitLots === 'object') {
                // จ่ายตามที่ระบุมาจากหน้าบ้านเป๊ะๆ
                for (const [lotIdString, qtyRequested] of Object.entries(explicitLots)) {
                    const lotToTake = lotMap.get(lotIdString);
                    const take = Number(qtyRequested);
                    if (!lotToTake || lotToTake.quantity < take) {
                        throw createHttpError(400, `Lot ${lotToTake?.lot_code || lotIdString} ไม่พอให้ตัดยอด`);
                    }
                    if (take <= 0) continue;

                    remaining -= take;
                    await lotRepo.decrementLotQuantitySafe(lotToTake.id, take, tx);
                    await requisitionRepo.createAllocation({
                        req_item_id: rItemId,
                        lot_id: lotToTake.id,
                        qty: take,
                        status: "COMPLETED"
                    }, tx);

                    await stockMovementRepo.createStockMovement({
                        item_id: currentReqItem.item_id,
                        lot_id: lotToTake.id,
                        quantity: take,
                        type: "OUT",
                        note: `เบิกจ่ายตามใบงาน (กำหนด Lot): ${header.doc_no}`,
                        created_by: approvedByName,
                        created_by_id: approvedById
                    }, tx);
                }
            } else {
                // ตัดสต็อกแบบ FEFO กรณีไม่ได้ส่ง Explicit Lots มาระบุ
                for (const lot of lots) {
                    if (remaining <= 0) break;
                    if (lot.quantity <= 0) continue;

                    const take = Math.min(remaining, lot.quantity);
                    remaining -= take;

                    // ลดสต็อกใน Lot + บันทึกการจับคู่ (Allocation) + บันทึกการเคลื่อนไหว
                    await lotRepo.decrementLotQuantitySafe(lot.id, take, tx);
                    await requisitionRepo.createAllocation({
                        req_item_id: rItemId,
                        lot_id: lot.id,
                        qty: take,
                        status: "COMPLETED"
                    }, tx);

                    await stockMovementRepo.createStockMovement({
                        item_id: currentReqItem.item_id,
                        lot_id: lot.id,
                        quantity: take,
                        type: "OUT",
                        note: `เบิกจ่ายตามใบงาน: ${header.doc_no}`,
                        created_by: approvedByName,
                        created_by_id: approvedById
                    }, tx);
                }
            }

            if (remaining > 0) {
                throw createHttpError(400, `สินค้า ${currentReqItem.items.name} สต็อกไม่พอ (ขาด ${remaining})`);
            }

            // ลดสต็อกรวมที่ Master Item และ Update ยอดในใบเบิก
            await requisitionRepo.updateRequisitionItem(rItemId, {
                issued_qty: qtyNeeded,
                approved_qty: qtyNeeded
            }, tx);
        }

        // อัปเดตสถานะ: ยืม = BORROWING, เบิก = APPROVED (รอนำส่ง)
        const nextStatus = header.type === 'BORROW' ? REQ_STATUS.BORROWING : REQ_STATUS.APPROVED;
        await requisitionRepo.updateHeaderStatus(headerId, nextStatus, approvedById, tx);

        // บันทึก Transaction Log
        await requisitionRepo.createLogTransaction({
            action: "APPROVE",
            module: "WAREHOUSE",
            code: header.doc_no,
            description: `อนุมัติจ่ายพัสดุเรียบร้อย รวม ${totalQty} ชิ้น`,
            status: "SUCCESS",
            created_by: approvedByName,
            created_by_id: approvedById
        }, tx);

        const updatedHeader = await requisitionRepo.SelectRequisitionById(headerId, tx);
        return DTO.mapRequisitionDetailResponse(updatedHeader);
    });
};

/**
 * 6. ปิดงานนำส่งสำหรับใบเบิก (WITHDRAW)
 */
const completeDelivery = async (headerId, userSession) => {
    const deliveredById = userSession?.user_id || null;
    const deliveredByName = userSession?.user_fullname || deliveredById || 'SYSTEM';

    return requisitionRepo.withTransaction(async (tx) => {
        const header = await requisitionRepo.SelectRequisitionById(headerId, tx);
        if (!header) throw createHttpError(404, 'ไม่พบใบเบิกที่ระบุ');
        if (header.type !== 'WITHDRAW') {
            throw createHttpError(400, 'ปิดงานนำส่งได้เฉพาะใบเบิก (WITHDRAW) เท่านั้น');
        }
        if (header.status !== REQ_STATUS.APPROVED) {
            throw createHttpError(400, `สถานะปัจจุบันคือ ${header.status} ไม่สามารถปิดงานนำส่งได้`);
        }

        await requisitionRepo.updateHeaderStatus(headerId, REQ_STATUS.COMPLETED, deliveredById, tx);

        await requisitionRepo.createLogTransaction({
            action: 'DELIVER',
            module: 'WAREHOUSE',
            code: header.doc_no,
            description: `นำส่งพัสดุใบ ${header.doc_no} เรียบร้อย`,
            status: 'SUCCESS',
            created_by: deliveredByName,
            created_by_id: deliveredById,
        }, tx);

        const updatedHeader = await requisitionRepo.SelectRequisitionById(headerId, tx);
        return DTO.mapRequisitionDetailResponse(updatedHeader);
    });
};

/**
 * 5. ปฏิเสธการเบิก (Reject)
 */
const rejectRequisition = async (headerId, note, userSession) => {
    const updatedById = userSession?.user_id || null;
    const updatedByName = userSession?.user_fullname || updatedById || 'SYSTEM';

    return requisitionRepo.withTransaction(async (tx) => {
        const header = await requisitionRepo.SelectRequisitionById(headerId, tx);
        if (!header || header.status !== REQ_STATUS.PENDING) {
            throw createHttpError(400, 'ไม่สามารถปฏิเสธรายการนี้ได้');
        }

        await requisitionRepo.updateHeaderStatus(headerId, REQ_STATUS.REJECTED, updatedById, tx);

        await requisitionRepo.createLogTransaction({
            action: "REJECT",
            module: "WAREHOUSE",
            code: header.doc_no,
            description: `ปฏิเสธใบเบิก ${header.doc_no} เหตุผล: ${note || 'ไม่ระบุ'}`,
            status: "SUCCESS",
            created_by: updatedByName,
            created_by_id: updatedById
        }, tx);

        const updatedHeader = await requisitionRepo.SelectRequisitionById(headerId, tx);
        return DTO.mapRequisitionDetailResponse(updatedHeader);
    });
};

const cancelRequisition = async (headerId, userSession) => {
    const cancelById = userSession?.user_id || null;
    const cancelByName = userSession?.user_fullname || cancelById || 'SYSTEM';

    const header = await requisitionRepo.SelectRequisitionById(headerId);
    if (!header) throw createHttpError(404, 'ไม่พบใบเบิกที่ระบุ');
    if (header.status !== REQ_STATUS.PENDING) {
        throw createHttpError(400, 'ลบได้เฟพาะรายการที่ยังรออนุมัติ (PENDING) เท่านั้น');
    }

    await requisitionRepo.softDeleteHeader(headerId);
    await requisitionRepo.createLogTransaction({
        action: 'CANCEL',
        module: 'WAREHOUSE',
        code: header.doc_no,
        description: `ยกเลิกใบเบิก ${header.doc_no}`,
        status: 'SUCCESS',
        created_by: cancelByName,
        created_by_id: cancelById,
    });

    return { id: headerId, status: 'CANCELLED' };
};

/**
 * ดึงรายการยืมที่ยังไม่คืน (สำหรับหน้าติดตามการคืน)
 */
const getActiveBorrows = async () => {
    const records = await requisitionRepo.SelectActiveBorrows();
    return records.map(DTO.mapRequisitionListResponse).filter(Boolean);
};

/**
 * 7. บันทึกการรับคืนพัสดุ (สำหรับเจ้าหน้าที่คลัง)
 *    items = [{ req_item_id, qty_returned, condition, note }]
 *    condition: GOOD | DAMAGED | LOST | INCOMPLETE
 */
const MOCK_USER_ID = "34120bd0-20a9-460c-a3bc-a2348b530552";

const processReturn = async (headerId, returnItems, userSession) => {
    const receivedById = userSession?.user_id || MOCK_USER_ID;
    const receivedByName = userSession?.user_fullname || receivedById || 'SYSTEM';

    return requisitionRepo.withTransaction(async (tx) => {
        const header = await requisitionRepo.SelectRequisitionById(headerId, tx);
        if (!header) throw createHttpError(404, 'ไม่พบใบยืมที่ระบุ');
        if (header.type !== 'BORROW') throw createHttpError(400, 'รายการนี้ไม่ใช่ใบยืม');
        if (header.status !== REQ_STATUS.BORROWING) {
            throw createHttpError(400, `สถานะปัจจุบันคือ ${header.status} ไม่สามารถรับคืนได้`);
        }

        const reqItemMap = new Map(header.requisition_item.map(item => [item.id, item]));

        for (const returnItem of returnItems) {
            const { req_item_id, qty_returned, condition, note } = returnItem;
            const rItemId = Number(req_item_id);
            const qtyToReturn = Number(qty_returned);
            if (qtyToReturn <= 0) continue;

            const currentReqItem = reqItemMap.get(rItemId);
            if (!currentReqItem) throw createHttpError(404, `ไม่พบรายการ ID: ${rItemId}`);

            const maxQty = (currentReqItem.issued_qty || 0) - (currentReqItem.returned_qty || 0);
            if (qtyToReturn > maxQty) {
                throw createHttpError(400, `จำนวนคืนเกินกว่าที่ยังค้างอยู่ (สูงสุด ${maxQty})`);
            }

            const itemType = normalizeItemType(currentReqItem.items?.type);

            // บันทึก return_log
            await requisitionRepo.createReturnLog({
                req_item_id: rItemId,
                qty: qtyToReturn,
                condition: condition || 'GOOD',
                note: note || null,
                receiver_id: receivedById,
                return_date: new Date(),
            }, tx);

            // อัปเดต returned_qty ใน requisition_item
            await requisitionRepo.updateRequisitionItem(rItemId, {
                returned_qty: { increment: qtyToReturn },
            }, tx);

            if (itemType === ITEM_TYPE.REUSABLE) {
                const targetUnits = await requisitionRepo.selectIssuedReusableUnitsForDocItem(
                    {
                        itemId: currentReqItem.item_id,
                        docNo: header.doc_no,
                        reqItemId: rItemId,
                        limit: qtyToReturn,
                    },
                    tx
                );

                if ((targetUnits?.length || 0) < qtyToReturn) {
                    throw createHttpError(400, `ไม่พบรายการครุภัณฑ์ใช้ซ้ำที่รอคืนครบตามจำนวน (${qtyToReturn})`);
                }

                const nextUnitState = getReusableReturnState(condition || 'GOOD');

                for (const unit of targetUnits) {
                    await requisitionRepo.updateReusableUnitStatus(
                        unit.id,
                        {
                            status: nextUnitState.status,
                            condition: nextUnitState.condition,
                            updated_at: new Date(),
                        },
                        tx
                    );

                    await requisitionRepo.createReusableUnitLog(
                        {
                            unit_id: unit.id,
                            action: 'RETURN_BORROW_REUSABLE',
                            from_department_id: unit.department_id || null,
                            to_department_id: unit.department_id || null,
                            ref_doc_no: header.doc_no,
                            note: `REQ_ITEM:${rItemId}${note ? ` | ${note}` : ''}`,
                            performed_by: receivedById,
                        },
                        tx
                    );
                }

                await stockMovementRepo.createStockMovement({
                    item_id: currentReqItem.item_id,
                    lot_id: null,
                    quantity: qtyToReturn,
                    type: 'ADJUST_IN',
                    note: `รับคืนพัสดุใช้ซ้ำจากใบ: ${header.doc_no}`,
                    created_by: receivedByName,
                    created_by_id: receivedById,
                }, tx);

                continue;
            }

            // สภาพดี → คืนสต็อก (ADJUST_IN)
            if (condition === 'GOOD') {
                const allocations = await requisitionRepo.SelectAllocationsForReqItem(rItemId, tx);
                let remaining = qtyToReturn;

                for (const alloc of allocations) {
                    if (remaining <= 0) break;
                    if (!alloc.lot_id) continue;
                    const restore = Math.min(remaining, alloc.qty);
                    remaining -= restore;

                    await requisitionRepo.incrementLotQuantity(alloc.lot_id, restore, tx);
                    await stockMovementRepo.createStockMovement({
                        item_id: currentReqItem.item_id,
                        lot_id: alloc.lot_id,
                        quantity: restore,
                        type: 'ADJUST_IN',
                        note: `รับคืนพัสดุจากใบ: ${header.doc_no}`,
                        created_by: receivedByName,
                        created_by_id: receivedById,
                    }, tx);
                }
            }
        }

        // ตรวจสอบว่าคืนครบทุกรายการแล้วหรือไม่
        const latestItems = await tx.requisition_item.findMany({
            where: { header_id: Number(headerId) },
            select: { issued_qty: true, returned_qty: true },
        });
        const allReturned = latestItems.length > 0 && latestItems.every(
            item => (item.returned_qty || 0) >= (item.issued_qty || 0)
        );

        if (allReturned) {
            await requisitionRepo.updateHeaderStatus(headerId, REQ_STATUS.COMPLETED, null, tx, {
                return_date: new Date(),
            });
        }

        await requisitionRepo.createLogTransaction({
            action: 'RETURN',
            module: 'WAREHOUSE',
            code: header.doc_no,
            description: `รับคืนพัสดุเลขที่ ${header.doc_no}${allReturned ? ' (คืนครบ)' : ' (คืนบางส่วน)'}`,
            status: 'SUCCESS',
            created_by: receivedByName,
            created_by_id: receivedById,
        }, tx);

        const updatedHeader = await requisitionRepo.SelectRequisitionById(headerId, tx);
        return DTO.mapRequisitionDetailResponse(updatedHeader);
    });
};

module.exports = {
    createRequisition,
    getAllRequisitions,
    getRequisitionDetail,
    approveRequisition,
    completeDelivery,
    rejectRequisition,
    cancelRequisition,
    getActiveBorrows,
    processReturn,
};