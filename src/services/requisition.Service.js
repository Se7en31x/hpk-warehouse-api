const DTO = require('../dtos/requisition.dto');
const requisitionRepo = require('../repositories/requisition.repo');
const stockMovementRepo = require('../repositories/stockmovement.repo');
const lotRepo = require('../repositories/lot.repo');
const { isAdmin, getUserDepartmentIds } = require('../utils/userAccess');
const { fireDispenseAdapter } = require('../adapters/dispense.adapter');

const REQ_STATUS = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    COMPLETED: 'COMPLETED',
    BORROWING: 'BORROWING',
    PENDING_RETURN_CHECK: 'PENDING_RETURN_CHECK',
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

const safeJsonParse = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    try { return JSON.parse(raw); } catch { return null; }
};

// ── Stock Movement Note Helpers ───────────────────────────────────────────────

/**
 * Label สำหรับแสดงชื่อสินค้าใน note: "MND001 ยา A" (code + name)
 */
const itemLabel = (reqItem) => {
    const code = reqItem?.items?.code || '';
    const name = reqItem?.items?.name || reqItem?.item_id || '';
    return [code, name].filter(Boolean).join(' ');
};

/**
 * ชื่อแผนก fallback เป็น "แผนก {id}"
 */
const deptLabel = (header) =>
    header?.departments?.name || (header?.department_id ? `แผนก ${header.department_id}` : '');

/**
 * รวม parts ที่ไม่ว่างด้วย " | "
 */
const joinNote = (...parts) => parts.filter(Boolean).join(' | ');

// ── End helpers ───────────────────────────────────────────────────────────────

const buildSubmittedReturnLogNote = ({ note, submitted_by, submitted_by_id, submitted_at }) => {
    return JSON.stringify({
        state: 'SUBMITTED',
        note: (note || '').toString() || null,
        submitted_by: submitted_by || null,
        submitted_by_id: submitted_by_id || null,
        submitted_at: submitted_at ? new Date(submitted_at).toISOString() : new Date().toISOString(),
    });
};

const buildVerifiedReturnLogNote = ({ previousNote, verified_by, verified_by_id, verified_at }) => {
    const parsed = safeJsonParse(previousNote);
    const base = parsed && typeof parsed === 'object' ? parsed : { note: previousNote || null };
    return JSON.stringify({
        ...base,
        state: 'VERIFIED',
        verified_by: verified_by || null,
        verified_by_id: verified_by_id || null,
        verified_at: verified_at ? new Date(verified_at).toISOString() : new Date().toISOString(),
    });
};

const buildSubmitReturnPayload = ({ items = [], submitted_by, submitted_by_id, submitted_at }) => {
    return JSON.stringify({
        state: 'SUBMITTED',
        items: Array.isArray(items) ? items : [],
        submitted_by: submitted_by || null,
        submitted_by_id: submitted_by_id || null,
        submitted_at: submitted_at ? new Date(submitted_at).toISOString() : new Date().toISOString(),
    });
};

const parseSubmitReturnPayload = (raw) => {
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return { ...parsed, items };
};

const parseVerifiedReturnPayload = (raw) => {
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
        verified_by: parsed.verified_by || null,
        verified_by_id: parsed.verified_by_id || null,
        verified_at: parsed.verified_at || null,
    };
};

/**
 * 1. สร้างใบเบิก/ยืมพัสดุ
 */
const createRequisition = async (data, userSession) => {
    const createdById   = userSession?.sub || null;
    const createdByName = userSession?.email || createdById || 'SYSTEM';

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

        const newDocNo = await requisitionRepo.generateDocNo(data.type, tx);

        let borrowerId = null;
        if (data.type === 'BORROW' && data.borrower) {
            const borrower = await requisitionRepo.createBorrowerDetails(data.borrower, tx);
            borrowerId = borrower.id;
        }

        // แก้ไข: ตรวจสอบและแปลง department_id เป็น Integer ก่อนส่งให้ DTO/Repo
        const headerPayload = DTO.createHeaderDTO(
            { 
                ...data, 
                department_id: data.department_id ? Number(data.department_id) : null 
            }, 
            newDocNo, 
            createdById, 
            borrowerId
        );
        
        const header = await requisitionRepo.createHeader(headerPayload, tx);

        const itemsPayload = DTO.createItemsDTO(data.items, header.id);
        await requisitionRepo.createItems(itemsPayload, tx);

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
 * 2. ดึงข้อมูลทั้งหมด
 * Admin: เห็นทั้งระบบ
 * User: เห็นเฉพาะใบของตัวเองหรือแผนกของตัวเอง
 */
const getAllRequisitions = async ({
    page = 1,
    limit = 10,
    keyword = '',
    type = '',
    status = '',
    start_date = '',
    end_date = '',
    department_id = '',
} = {}, userSession = null) => {
    const parsedPage = Math.max(1, Number(page));
    const parsedLimit = Math.max(1, Number(limit));

    // ── Access Control ───────────────────────────────────────────────────────
    // Full visibility is granted when:
    //   • role.name === 'admin'              (role-based)
    //   • systems includes 'Warehouse'       (warehouse staff)
    //   • systems includes 'Administration'  (admin department staff)
    //
    // The auth middleware stores systems at userSession.systems (top-level).
    // We also fall back to userSession.app_metadata.systems to handle callers
    // that pass the raw JWT payload instead of the shaped req.user object.
    // Each entry may be a plain string or an object { id, name } — handle both.
    const rawSystems = userSession?.systems || userSession?.app_metadata?.systems || [];
    const systemNames = rawSystems.map((s) => (typeof s === 'string' ? s : (s?.name ?? '')));

    const FULL_ACCESS_SYSTEMS = ['Warehouse', 'Administration'];
    const hasFullAccessSystem =
        isAdmin(userSession) ||
        systemNames.some((name) => FULL_ACCESS_SYSTEMS.includes(name));

    // DEBUG — remove once confirmed working in production
    console.log('[requisition] user:', userSession?.sub, '| systemNames:', systemNames, '| hasFullAccessSystem:', hasFullAccessSystem);

    let requester_id   = null;
    let department_ids = [];

    if (!hasFullAccessSystem) {
        // Restrict to own requests OR own department(s)
        requester_id   = userSession?.sub || null;
        department_ids = getUserDepartmentIds(userSession);
    }
    // When hasFullAccessSystem === true, requester_id/department_ids remain null/[]
    // and the repo will return all records with no access-control WHERE clause.
    // ─────────────────────────────────────────────────────────────────────────

    const result = await requisitionRepo.SelectAllRequisitions({
        page: parsedPage,
        limit: parsedLimit,
        keyword,
        type,
        status,
        start_date,
        end_date,
        department_id: department_id ? Number(department_id) : null,
        requester_id,
        department_ids,
    });

    const totalPages = Math.max(1, Math.ceil(result.total / parsedLimit));

    return {
        items: (result.items || []).map(DTO.mapRequisitionListResponse),
        total: result.total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages,
    };
};

/**
 * 3. ดึงข้อมูลรายใบ
 */
const getRequisitionDetail = async (headerId) => {
    const header = await requisitionRepo.SelectRequisitionById(headerId);
    if (!header) throw createHttpError(404, 'ไม่พบใบเบิกที่ระบุ');
    
    const mapped = DTO.mapRequisitionDetailResponse(header);

    for (let i = 0; i < mapped.items.length; i++) {
        const item = mapped.items[i];
        if (item.itemType === 'REUSABLE') {
            const units = await requisitionRepo.selectAvailableReusableUnitsByItem(item.item_id, 99999);
            item.available_units = units.map(u => ({
                id: u.id,
                unit_code: u.unit_code,
            }));
            item.available_lots = [];

            // ดึงรหัสครุภัณฑ์ที่จ่ายออกแล้วจาก movement logs
            const unitLogs = await requisitionRepo.getIssuedReusableUnitsForReqItem(item.id, mapped.doc_no);
            item.issued_units = unitLogs
                .map(log => ({
                    id: log.unit_id,
                    unit_code: log.reusable_item_unit?.unit_code || null,
                    serial_no: log.reusable_item_unit?.serial_no || null,
                }))
                .filter(u => u.unit_code);

            // ดึง outstanding units (ยังอยู่ในสถานะ IN_USE) สำหรับฟอร์มคืน
            const outstandingUnits = await requisitionRepo.selectOutstandingReusableUnitsForDocItem({
                itemId: item.item_id,
                docNo: mapped.doc_no,
                reqItemId: item.id,
            });
            item.outstanding_units = outstandingUnits.map(u => ({
                id: u.id,
                unit_code: u.unit_code,
                serial_no: u.serial_no || null,
            }));
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

    // ดึง snapshot ที่ผู้ยืมส่งคืน — ใช้แสดงรายละเอียดตอนตรวจรับหรือดูประวัติ
    if (
        mapped.type === 'BORROW'
        && (mapped.status === REQ_STATUS.PENDING_RETURN_CHECK || mapped.status === REQ_STATUS.COMPLETED)
    ) {
        const log = await requisitionRepo.selectLatestReturnSubmissionLog(mapped.doc_no);
        mapped.pending_return_submission = parseSubmitReturnPayload(log?.description || null) || null;
    }

    if (mapped.type === 'BORROW' && mapped.status === REQ_STATUS.COMPLETED) {
        const verifyLog = await requisitionRepo.selectLatestReturnVerifyLog(mapped.doc_no);
        const verifyPayload = parseVerifiedReturnPayload(verifyLog?.description || null);
        const verifiedById = verifyPayload?.verified_by_id || verifyLog?.created_by_id || null;
        const verifiedAt = verifyPayload?.verified_at || verifyLog?.created_at || null;
        const verifiedByName =
            verifyLog?.verified_by_name
            || verifyPayload?.verified_by
            || verifyLog?.created_by
            || null;
        mapped.return_verified_by = verifyPayload?.verified_by || verifyLog?.created_by || null;
        mapped.return_verified_by_id = verifiedById;
        mapped.return_verified_by_name = verifiedByName;
        mapped.return_verified_at = verifiedAt;
    }

    return mapped;
};

/**
 * 4. อนุมัติและตัดสต็อก
 */
const approveRequisition = async (headerId, itemsToIssue, userSession) => {
    const approvedById = userSession?.sub || null;
    const approvedByName = userSession?.email || approvedById || 'SYSTEM';

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
            
            let qtyNeeded = 0;
            let explicitLots = null;
            let explicitUnits = null;

            if (typeof allocationData === 'object' && allocationData !== null) {
                qtyNeeded = Number(allocationData.qty || 0);
                explicitLots = allocationData.lots || null;
                explicitUnits = allocationData.units || null;
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
                        throw createHttpError(400, `ระบุสินค้า ${currentReqItem.items.name} ไม่ครบตามจำนวน (${reusableUnits.length}/${qtyNeeded})`);
                    }
                } else {
                    reusableUnits = await requisitionRepo.selectAvailableReusableUnitsByItem(currentReqItem.item_id, qtyNeeded, tx);
                }

                if ((reusableUnits?.length || 0) < qtyNeeded) {
                    throw createHttpError(400, `สินค้า ${currentReqItem.items.name} สต็อกไม่พอ`);
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

                const reusableBalBefore = await stockMovementRepo.fetchItemCurrentStock(currentReqItem.item_id, tx);
                const reqTypeLabel = header.type === 'BORROW' ? 'ยืม' : 'เบิก';
                const issuedUnitCodes = reusableUnits.map(u => u.unit_code).filter(Boolean).join(', ');
                await stockMovementRepo.createStockMovement({
                    item_id: currentReqItem.item_id,
                    quantity: qtyNeeded,
                    type: 'OUT',
                    note: joinNote(
                        `[${reqTypeLabel}] ${itemLabel(currentReqItem)} ${qtyNeeded} ชิ้น`,
                        `ใบ ${header.doc_no}`,
                        deptLabel(header),
                        issuedUnitCodes || null,
                    ),
                    created_by: approvedByName,
                    created_by_id: approvedById,
                    balance_before: reusableBalBefore,
                    balance_after: reusableBalBefore - qtyNeeded,
                }, tx);

                await requisitionRepo.updateRequisitionItem(rItemId, {
                    issued_qty: qtyNeeded,
                    approved_qty: qtyNeeded,
                }, tx);

                continue;
            }

            // --- Lot Consumable Logic ---
            const lots = await requisitionRepo.getItemLots(currentReqItem.item_id, tx);
            const lotMap = new Map(lots.map(l => [l.id.toString(), l]));
            let remaining = qtyNeeded;

            // Running balance — read once before any lot is decremented
            let runningBal = await stockMovementRepo.fetchItemCurrentStock(currentReqItem.item_id, tx);

            if (explicitLots && typeof explicitLots === 'object') {
                for (const [lotIdString, qtyRequested] of Object.entries(explicitLots)) {
                    const lotToTake = lotMap.get(lotIdString);
                    const take = Number(qtyRequested);
                    if (!lotToTake || lotToTake.quantity < take) {
                        throw createHttpError(400, `Lot ${lotToTake?.lot_code || lotIdString} ไม่พอ`);
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
                        note: joinNote(
                            `[เบิก] ${itemLabel(currentReqItem)} ${take} ชิ้น`,
                            `ล็อต ${lotToTake.lot_code}`,
                            `ใบ ${header.doc_no}`,
                            deptLabel(header),
                        ),
                        created_by: approvedByName,
                        created_by_id: approvedById,
                        balance_before: runningBal,
                        balance_after: runningBal - take,
                    }, tx);
                    runningBal -= take;
                }
            } else {
                for (const lot of lots) {
                    if (remaining <= 0) break;
                    if (lot.quantity <= 0) continue;
                    const take = Math.min(remaining, lot.quantity);
                    remaining -= take;

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
                        note: joinNote(
                            `[เบิก] ${itemLabel(currentReqItem)} ${take} ชิ้น`,
                            `ล็อต ${lot.lot_code}`,
                            `ใบ ${header.doc_no}`,
                            deptLabel(header),
                        ),
                        created_by: approvedByName,
                        created_by_id: approvedById,
                        balance_before: runningBal,
                        balance_after: runningBal - take,
                    }, tx);
                    runningBal -= take;
                }
            }

            if (remaining > 0) throw createHttpError(400, `สินค้า ${currentReqItem.items.name} สต็อกไม่พอ`);

            await requisitionRepo.updateRequisitionItem(rItemId, {
                issued_qty: qtyNeeded,
                approved_qty: qtyNeeded
            }, tx);
        }

        const nextStatus = REQ_STATUS.APPROVED;
        await requisitionRepo.updateHeaderStatus(headerId, nextStatus, approvedById, tx);

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
 * 6. ปิดงานนำส่ง
 */
const completeDelivery = async (headerId, userSession) => {
    const deliveredById = userSession?.sub || null;
    const deliveredByName = userSession?.email || deliveredById || 'SYSTEM';

    let rawHeaderForAdapter = null;

    const result = await requisitionRepo.withTransaction(async (tx) => {
        const header = await requisitionRepo.SelectRequisitionById(headerId, tx);
        if (!header) throw createHttpError(404, 'ไม่พบใบเบิกที่ระบุ');
        const reqType = (header.type || '').toString().trim().toUpperCase();
        if (reqType !== 'WITHDRAW' && reqType !== 'BORROW') {
            throw createHttpError(400, 'ประเภทเอกสารไม่ถูกต้อง');
        }
        if (header.status !== REQ_STATUS.APPROVED) throw createHttpError(400, 'สถานะไม่ถูกต้อง');

        const nextStatus = reqType === 'BORROW' ? REQ_STATUS.BORROWING : REQ_STATUS.COMPLETED;
        await requisitionRepo.updateHeaderStatus(headerId, nextStatus, deliveredById, tx);

        await requisitionRepo.createLogTransaction({
            action: 'DELIVER',
            module: 'WAREHOUSE',
            code: header.doc_no,
            description:
                reqType === 'BORROW'
                    ? `ส่งมอบครุภัณฑ์ (ยืม) ใบ ${header.doc_no} เรียบร้อย`
                    : `นำส่งพัสดุ (เบิก) ใบ ${header.doc_no} เรียบร้อย`,
            status: 'SUCCESS',
            created_by: deliveredByName,
            created_by_id: deliveredById,
        }, tx);

        const updatedHeader = await requisitionRepo.SelectRequisitionById(headerId, tx);
        rawHeaderForAdapter = updatedHeader;
        return DTO.mapRequisitionDetailResponse(updatedHeader);
    });

    // fire-and-forget — ไม่ block response, ไม่ throw ออกมา
    if (rawHeaderForAdapter) {
        fireDispenseAdapter(rawHeaderForAdapter).catch((err) =>
            console.error('[completeDelivery] dispense adapter error:', err.message)
        );
    }

    return result;
};

/**
 * 5. ปฏิเสธการเบิก
 */
const rejectRequisition = async (headerId, note, userSession) => {
    const updatedById = userSession?.sub || null;
    const updatedByName = userSession?.email || updatedById || 'SYSTEM';

    return requisitionRepo.withTransaction(async (tx) => {
        const header = await requisitionRepo.SelectRequisitionById(headerId, tx);
        if (!header || header.status !== REQ_STATUS.PENDING) throw createHttpError(400, 'ไม่สามารถปฏิเสธได้');

        await requisitionRepo.updateHeaderStatus(headerId, REQ_STATUS.REJECTED, updatedById, tx);
        const updatedHeader = await requisitionRepo.SelectRequisitionById(headerId, tx);
        return DTO.mapRequisitionDetailResponse(updatedHeader);
    });
};

/**
 * 7. ยกเลิก
 */
const cancelRequisition = async (headerId, userSession) => {
    const cancelById = userSession?.sub || null;
    const cancelByName = userSession?.email || cancelById || 'SYSTEM';

    const header = await requisitionRepo.SelectRequisitionById(headerId);
    if (!header || header.status !== REQ_STATUS.PENDING) throw createHttpError(400, 'ไม่สามารถยกเลิกได้');

    await requisitionRepo.softDeleteHeader(headerId);
    return { id: headerId, status: 'CANCELLED' };
};

/**
 * ดึงรายการยืมที่ยังไม่คืน
 */
const getActiveBorrows = async () => {
    const records = await requisitionRepo.SelectActiveBorrows();
    return records.map(DTO.mapRequisitionListResponse).filter(Boolean);
};

/**
 * 8. รับคืนพัสดุ
 */
const submitReturn = async (headerId, returnItems, userSession) => {
    const submittedById = userSession?.sub || null;
    const submittedByName = userSession?.email || submittedById || 'SYSTEM';

    return requisitionRepo.withTransaction(async (tx) => {
        const header = await requisitionRepo.SelectRequisitionById(headerId, tx);
        if (!header || header.type !== 'BORROW' || header.status !== REQ_STATUS.BORROWING) {
            throw createHttpError(400, 'ไม่สามารถส่งคืนได้');
        }

        const reqItemMap = new Map(header.requisition_item.map((item) => [item.id, item]));
        const normalizedItems = [];

        for (const returnItem of returnItems) {
            const { req_item_id, qty_returned, condition, note, units } = returnItem || {};
            const rItemId = Number(req_item_id);
            const qtyToReturn = Number(qty_returned);
            if (!Number.isInteger(rItemId) || rItemId <= 0) throw createHttpError(400, 'req_item_id ไม่ถูกต้อง');
            if (!Number.isInteger(qtyToReturn) || qtyToReturn <= 0) throw createHttpError(400, 'qty_returned ไม่ถูกต้อง');

            const currentReqItem = reqItemMap.get(rItemId);
            if (!currentReqItem) throw createHttpError(404, `ไม่พบรายการ ID: ${rItemId}`);

            const maxQty = (currentReqItem.issued_qty || 0) - (currentReqItem.returned_qty || 0);
            if (qtyToReturn > maxQty) throw createHttpError(400, `จำนวนคืนเกินค้างจ่าย`);

            const normalizedEntry = {
                req_item_id: rItemId,
                qty_returned: qtyToReturn,
                condition: (condition || 'GOOD').toString().trim().toUpperCase(),
                note: (note || '').toString() || null,
            };

            // Preserve per-unit details for REUSABLE items so verifyReturn can process them
            if (Array.isArray(units) && units.length > 0) {
                normalizedEntry.units = units.map(u => ({
                    unit_id: u.unit_id,
                    condition: (u.condition || 'GOOD').toString().trim().toUpperCase(),
                    note: (u.note || '').toString() || null,
                }));
            }

            normalizedItems.push(normalizedEntry);
        }

        await requisitionRepo.createLogTransaction(
            {
                action: 'SUBMIT_RETURN',
                module: 'WAREHOUSE',
                code: header.doc_no,
                description: buildSubmitReturnPayload({
                    items: normalizedItems,
                    submitted_by: submittedByName,
                    submitted_by_id: submittedById,
                    submitted_at: new Date(),
                }),
                status: 'SUCCESS',
                created_by: submittedByName,
                created_by_id: submittedById,
            },
            tx
        );

        await requisitionRepo.updateHeaderStatus(headerId, REQ_STATUS.PENDING_RETURN_CHECK, null, tx);

        return DTO.mapRequisitionDetailResponse(await requisitionRepo.SelectRequisitionById(headerId, tx));
    });
};

const verifyReturn = async (headerId, userSession) => {
    const verifiedById = userSession?.sub || null;
    const verifiedByName = userSession?.email || verifiedById || 'SYSTEM';

    return requisitionRepo.withTransaction(async (tx) => {
        const header = await requisitionRepo.SelectRequisitionById(headerId, tx);
        if (!header || header.type !== 'BORROW' || header.status !== REQ_STATUS.PENDING_RETURN_CHECK) {
            throw createHttpError(400, 'ไม่สามารถยืนยันการรับคืนได้');
        }

        const submissionLog = await requisitionRepo.selectLatestReturnSubmissionLog(header.doc_no, tx);
        const submissionPayload = parseSubmitReturnPayload(submissionLog?.description || null);
        const submittedItems = submissionPayload?.items || [];
        if (!submittedItems.length) throw createHttpError(400, 'ไม่พบรายการส่งคืนที่รอตรวจสอบ');

        const reqItemMap = new Map(header.requisition_item.map((item) => [item.id, item]));

        for (const submitted of submittedItems) {
            const rItemId = Number(submitted?.req_item_id);
            const qtyToReturn = Number(submitted?.qty_returned || 0);
            const condition = (submitted?.condition || 'GOOD').toString().trim().toUpperCase();
            const userNote = (submitted?.note || '').toString() || null;
            if (!Number.isInteger(rItemId) || rItemId <= 0) continue;
            if (!Number.isInteger(qtyToReturn) || qtyToReturn <= 0) continue;

            const currentReqItem = reqItemMap.get(rItemId);
            if (!currentReqItem) throw createHttpError(404, `ไม่พบรายการ ID: ${rItemId}`);

            const maxQty = (currentReqItem.issued_qty || 0) - (currentReqItem.returned_qty || 0);
            if (qtyToReturn > maxQty) throw createHttpError(400, `จำนวนคืนเกินค้างจ่าย`);

            const itemType = normalizeItemType(currentReqItem.items?.type);

            // Update returned qty (verified)
            await requisitionRepo.updateRequisitionItem(
                rItemId,
                {
                    returned_qty: { increment: qtyToReturn },
                },
                tx
            );

            if (itemType === ITEM_TYPE.REUSABLE) {
                const perUnitDetails = Array.isArray(submitted.units) && submitted.units.length > 0
                    ? submitted.units
                    : null;

                const returnedUnitCodes = [];

                if (perUnitDetails) {
                    // New path: process each specific unit with its own condition/note
                    for (const unitDetail of perUnitDetails) {
                        const unitId = String(unitDetail.unit_id || '');
                        if (!unitId) continue;
                        const unitCondition = (unitDetail.condition || 'GOOD').toString().toUpperCase();
                        const unitNote = (unitDetail.note || '').toString() || null;

                        const unit = await tx.reusable_item_units.findUnique({ where: { id: unitId } });
                        if (!unit || unit.status !== 'IN_USE') continue;

                        if (unit.unit_code) returnedUnitCodes.push(unit.unit_code);

                        const nextUnitState = getReusableReturnState(unitCondition);
                        await requisitionRepo.updateReusableUnitStatus(
                            unit.id,
                            { status: nextUnitState.status, condition: nextUnitState.condition, updated_at: new Date() },
                            tx
                        );
                        await requisitionRepo.createReusableUnitLog(
                            {
                                unit_id: unit.id,
                                action: 'VERIFY_RETURN_BORROW_REUSABLE',
                                from_department_id: unit.department_id || null,
                                to_department_id: unit.department_id || null,
                                ref_doc_no: header.doc_no,
                                note: joinNote(`REQ_ITEM:${rItemId}`, unitNote),
                                performed_by: verifiedById,
                            },
                            tx
                        );
                    }
                } else {
                    // Old path: backward-compatible arbitrary selection
                    const targetUnits = await requisitionRepo.selectIssuedReusableUnitsForDocItem(
                        { itemId: currentReqItem.item_id, docNo: header.doc_no, reqItemId: rItemId, limit: qtyToReturn },
                        tx
                    );
                    const nextUnitState = getReusableReturnState(condition || 'GOOD');
                    for (const unit of targetUnits) {
                        if (unit.unit_code) returnedUnitCodes.push(unit.unit_code);
                        await requisitionRepo.updateReusableUnitStatus(
                            unit.id,
                            { status: nextUnitState.status, condition: nextUnitState.condition, updated_at: new Date() },
                            tx
                        );
                        await requisitionRepo.createReusableUnitLog(
                            {
                                unit_id: unit.id,
                                action: 'VERIFY_RETURN_BORROW_REUSABLE',
                                from_department_id: unit.department_id || null,
                                to_department_id: unit.department_id || null,
                                ref_doc_no: header.doc_no,
                                note: joinNote(`REQ_ITEM:${rItemId}`, userNote),
                                performed_by: verifiedById,
                            },
                            tx
                        );
                    }
                }

                const CONDITION_LABEL = { GOOD: 'ดี', DAMAGED: 'ชำรุด', LOST: 'สูญหาย', INCOMPLETE: 'ไม่ครบ' };
                const condLabel = CONDITION_LABEL[condition] || condition;
                const retReusableBal = await stockMovementRepo.fetchItemCurrentStock(currentReqItem.item_id, tx);
                await stockMovementRepo.createStockMovement(
                    {
                        item_id: currentReqItem.item_id,
                        quantity: qtyToReturn,
                        type: 'ADJUST_IN',
                        note: joinNote(
                            `[รับคืน] ${itemLabel(currentReqItem)} ${qtyToReturn} ชิ้น`,
                            `สภาพ: ${condLabel}`,
                            `ใบ ${header.doc_no}`,
                            deptLabel(header),
                            returnedUnitCodes.length ? returnedUnitCodes.join(', ') : null,
                            userNote ? `หมายเหตุ: ${userNote}` : null,
                        ),
                        created_by: verifiedByName,
                        created_by_id: verifiedById,
                        balance_before: retReusableBal,
                        balance_after: retReusableBal + qtyToReturn,
                    },
                    tx
                );

                continue;
            }

            // Consumable: restore to lots only when GOOD
            if (condition === 'GOOD') {
                const allocations = await requisitionRepo.SelectAllocationsForReqItem(rItemId, tx);
                let remaining = qtyToReturn;
                let retRunningBal = await stockMovementRepo.fetchItemCurrentStock(currentReqItem.item_id, tx);

                for (const alloc of allocations) {
                    if (remaining <= 0) break;
                    if (!alloc.lot_id) continue;
                    const restore = Math.min(remaining, alloc.qty);
                    remaining -= restore;

                    const allocLotCode = alloc.item_lots?.lot_code || alloc.lot_id;
                    await requisitionRepo.incrementLotQuantity(alloc.lot_id, restore, tx);
                    await stockMovementRepo.createStockMovement(
                        {
                            item_id: currentReqItem.item_id,
                            lot_id: alloc.lot_id,
                            quantity: restore,
                            type: 'ADJUST_IN',
                            note: joinNote(
                                `[รับคืน] ${itemLabel(currentReqItem)} ${restore} ชิ้น`,
                                `ล็อต ${allocLotCode}`,
                                `ใบ ${header.doc_no}`,
                                deptLabel(header),
                                userNote ? `หมายเหตุ: ${userNote}` : null,
                            ),
                            created_by: verifiedByName,
                            created_by_id: verifiedById,
                            balance_before: retRunningBal,
                            balance_after: retRunningBal + restore,
                        },
                        tx
                    );
                    retRunningBal += restore;
                }
            }
        }
        await requisitionRepo.createLogTransaction(
            {
                action: 'VERIFY_RETURN',
                module: 'WAREHOUSE',
                code: header.doc_no,
                description: buildVerifiedReturnLogNote({
                    previousNote: submissionLog?.description || null,
                    verified_by: verifiedByName,
                    verified_by_id: verifiedById,
                    verified_at: new Date(),
                }),
                status: 'SUCCESS',
                created_by: verifiedByName,
                created_by_id: verifiedById,
            },
            tx
        );

        // If fully returned => COMPLETED else back to BORROWING
        const latestItems = await tx.requisition_item.findMany({
            where: { header_id: Number(headerId) },
            select: { issued_qty: true, returned_qty: true },
        });
        const allReturned = latestItems.every((i) => (i.returned_qty || 0) >= (i.issued_qty || 0));

        if (allReturned) {
            await requisitionRepo.updateHeaderStatus(headerId, REQ_STATUS.COMPLETED, null, tx, {
                return_date: new Date(),
            });
        } else {
            await requisitionRepo.updateHeaderStatus(headerId, REQ_STATUS.BORROWING, null, tx);
        }

        const mapped = DTO.mapRequisitionDetailResponse(await requisitionRepo.SelectRequisitionById(headerId, tx));
        // expose the items verified in this transaction so the controller can build notifications
        mapped._returnedItems = submittedItems;
        return mapped;
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
    submitReturn,
    verifyReturn,
};