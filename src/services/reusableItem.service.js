const DTO = require('../dtos/reusableItem.dto');
const reusableRepo = require('../repositories/reusableItem.repo');

const RECEIVE_STATUS = {
    COMPLETED: 'COMPLETED',
};

const DEFAULT_STATUS = 'AVAILABLE';
const DEFAULT_CONDITION = 'GOOD';
const RETURN_REQUEST_STATUS = {
    REQUESTED: 'REQUESTED',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
};

const inferUsageContextFromLog = (log = null) => {
    const action = (log?.action || '').toString().toUpperCase();
    const refDocNo = (log?.ref_doc_no || '').toString().toUpperCase();

    if (action === 'ISSUE_WITHDRAW_REUSABLE') return 'WITHDRAW';
    if (action === 'ISSUE_BORROW_REUSABLE') return 'BORROW';
    if (action === 'ISSUE_REUSABLE') {
        if (refDocNo.startsWith('REQ-')) return 'WITHDRAW';
        if (refDocNo.startsWith('BOR-')) return 'BORROW';
    }

    return null;
};

const createHttpError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const getReusableReturnState = (condition = 'GOOD') => {
    const normalizedCondition = (condition || 'GOOD').toString().trim().toUpperCase();

    if (normalizedCondition === 'LOST') {
        return { status: 'DISPOSED', condition: 'LOST' };
    }
    if (normalizedCondition === 'DAMAGED' || normalizedCondition === 'INCOMPLETE') {
        return { status: 'REPAIR', condition: 'DAMAGED' };
    }

    return { status: 'AVAILABLE', condition: 'GOOD' };
};

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

const enrichReturnRequestWithUnitDetails = async (mappedRequest, tx = null) => {
    const allCodes = Array.from(
        new Set(
            (mappedRequest.items || []).flatMap((item) => parseRequestedUnitCodes(item.note))
        )
    );

    if (!allCodes.length) {
        return {
            ...mappedRequest,
            items: (mappedRequest.items || []).map((item) => ({
                ...item,
                requested_unit_codes: parseRequestedUnitCodes(item.note),
                requested_units: [],
            })),
        };
    }

    const unitRows = await reusableRepo.selectUnitsByCodes(
        {
            departmentId: mappedRequest.department_id,
            unitCodes: allCodes,
        },
        tx || undefined
    );

    const unitByCode = new Map((unitRows || []).map((unit) => [unit.unit_code, unit]));

    return {
        ...mappedRequest,
        items: (mappedRequest.items || []).map((item) => {
            const requestedUnitCodes = parseRequestedUnitCodes(item.note);

            return {
                ...item,
                requested_unit_codes: requestedUnitCodes,
                requested_units: requestedUnitCodes.map((code) => {
                    const unit = unitByCode.get(code);
                    return {
                        id: unit?.id || null,
                        unit_code: code,
                        serial_no: unit?.serial_no || null,
                        item_id: unit?.item_id || item.item_id,
                        item_name: unit?.items?.name || item.item_name || null,
                        status: unit?.status || null,
                        condition: unit?.condition || null,
                        is_found: Boolean(unit),
                    };
                }),
            };
        }),
    };
};

const generateReturnRequestDocNo = async (tx) => {
    const year = new Date().getFullYear();
    const baseCount = await reusableRepo.countReturnRequestsByYear(year, tx);
    const seq = String(baseCount + 1).padStart(5, '0');
    return `RTR-${year}${seq}`;
};

const generateUnitCodes = async (count, tx) => {
    const year = new Date().getFullYear();
    const baseCount = await reusableRepo.countUnitsByYear(year, tx);

    return Array.from({ length: count }, (_, idx) => {
        const seq = String(baseCount + idx + 1).padStart(5, '0');
        return `RUI-${year}${seq}`;
    });
};

const createReusableReceive = async (data, userSession) => {
    const createdById = userSession?.user_id || null;

    return reusableRepo.withTransaction(async (tx) => {
        const header = await reusableRepo.createReceiveHeader(
            {
                doc_no: data.doc_no.toString().trim(),
                type: DTO.RECEIVE_TYPE,
                status: RECEIVE_STATUS.COMPLETED,
                supplier_id: data.supplier_id || null,
                donor_name: data.donor_name || null,
                receive_date: data.receive_date ? new Date(data.receive_date) : new Date(),
                note: data.note || null,
                created_by: createdById,
            },
            tx
        );

        const receiveItemsPayload = data.items.map((item) => ({
            header_id: header.id,
            item_id: item.item_id,
            lot_code: null,
            qty: item.units.length,
            expected_qty: item.units.length,
            cost_price: item.cost_price !== undefined ? Number(item.cost_price) : 0,
            expired_at: null,
        }));

        await reusableRepo.createReceiveItems(receiveItemsPayload, tx);

        const dbReceiveItems = await reusableRepo.selectReceiveItemsByHeader(header.id, tx);
        const receiveItemByItemId = new Map(dbReceiveItems.map((ri) => [ri.item_id, ri]));

        const allUnitsInput = [];
        for (const item of data.items) {
            for (const unit of item.units) {
                allUnitsInput.push({
                    item_id: item.item_id,
                    receive_item_id: receiveItemByItemId.get(item.item_id)?.id || null,
                    serial_no: unit.serial_no || null,
                    department_id: unit.department_id || null,
                    status: (unit.status || DEFAULT_STATUS).toUpperCase(),
                    condition: (unit.condition || DEFAULT_CONDITION).toUpperCase(),
                    note: unit.note || null,
                    unit_code: unit.unit_code || null,
                });
            }
        }

        const missingCodeCount = allUnitsInput.filter((unit) => !unit.unit_code).length;
        const generatedCodes = await generateUnitCodes(missingCodeCount, tx);

        let codeCursor = 0;
        const unitsPayload = allUnitsInput.map((unit) => ({
            unit_code: unit.unit_code || generatedCodes[codeCursor++],
            item_id: unit.item_id,
            receive_item_id: unit.receive_item_id,
            serial_no: unit.serial_no,
            department_id: unit.department_id,
            status: unit.status,
            condition: unit.condition,
            note: unit.note,
        }));

        await reusableRepo.createReusableUnits(unitsPayload, tx);

        return {
            receive_id: header.id,
            doc_no: header.doc_no,
            type: header.type,
            total_items: data.items.length,
            total_units: unitsPayload.length,
        };
    });
};

const getReusableUnits = async (query = {}) => {
    const [items, total] = await reusableRepo.selectReusableUnits(query);
    const totalPages = Math.max(1, Math.ceil(total / query.limit));

    return {
        items: items.map(DTO.mapReusableUnitResponse),
        total,
        page: query.page,
        limit: query.limit,
        totalPages,
        nextPage: query.page < totalPages ? query.page + 1 : null,
        prevPage: query.page > 1 ? query.page - 1 : null,
    };
};

const getReusableUnitById = async (id) => {
    const unit = await reusableRepo.selectReusableUnitById(id);
    if (!unit || unit.deleted_at) {
        throw createHttpError(404, 'Reusable unit not found');
    }

    return DTO.mapReusableUnitResponse(unit);
};

const updateReusableUnit = async (id, data = {}, userSession = null) => {
    const updatedById = userSession?.user_id || null;

    if (Object.prototype.hasOwnProperty.call(data, 'unit_code')) {
        throw createHttpError(400, 'unit_code is immutable and cannot be edited');
    }

    return reusableRepo.withTransaction(async (tx) => {
        const existing = await reusableRepo.selectReusableUnitById(id, tx);
        if (!existing || existing.deleted_at) {
            throw createHttpError(404, 'Reusable unit not found');
        }

        const nextStatus = (data.status || existing.status || DEFAULT_STATUS).toString().trim().toUpperCase();
        const nextCondition = (data.condition || existing.condition || DEFAULT_CONDITION).toString().trim().toUpperCase();

        if (nextCondition === 'LOST' && nextStatus !== 'DISPOSED') {
            throw createHttpError(400, 'condition LOST ต้องมีสถานะเป็น DISPOSED เท่านั้น');
        }

        const updated = await reusableRepo.updateReusableUnit(
            id,
            {
                ...(Object.prototype.hasOwnProperty.call(data, 'serial_no') && {
                    serial_no: data.serial_no ? data.serial_no.toString().trim() : null,
                }),
                ...(Object.prototype.hasOwnProperty.call(data, 'department_id') && {
                    department_id: data.department_id ? Number(data.department_id) : null,
                }),
                ...(Object.prototype.hasOwnProperty.call(data, 'status') && { status: nextStatus }),
                ...(Object.prototype.hasOwnProperty.call(data, 'condition') && { condition: nextCondition }),
                ...(Object.prototype.hasOwnProperty.call(data, 'note') && { note: data.note || null }),
            },
            tx
        );

        await reusableRepo.createReusableUnitLog(
            {
                unit_id: id,
                action: 'UPDATE',
                from_department_id: existing.department_id || null,
                to_department_id: updated.department_id || null,
                note: `Update unit ${existing.unit_code}`,
                performed_by: updatedById,
            },
            tx
        );

        return DTO.mapReusableUnitResponse(updated);
    });
};

const returnReusableFromWithdraw = async (id, data = {}, userSession = null) => {
    const updatedById = userSession?.user_id || null;
    const conditionInput = (data.condition || 'GOOD').toString().trim().toUpperCase();

    return reusableRepo.withTransaction(async (tx) => {
        const existing = await reusableRepo.selectReusableUnitById(id, tx);
        if (!existing || existing.deleted_at) {
            throw createHttpError(404, 'Reusable unit not found');
        }

        if ((existing.status || '').toUpperCase() !== 'IN_USE') {
            throw createHttpError(400, 'unit นี้ไม่ได้อยู่ในสถานะกำลังใช้งาน');
        }

        const usageContext = inferUsageContextFromLog(existing.movement_logs?.[0] || null);
        if (usageContext !== 'WITHDRAW') {
            throw createHttpError(400, 'unit นี้ไม่ได้ออกจากการเบิกใช้งาน (WITHDRAW)');
        }

        const nextCondition = ['GOOD', 'DAMAGED', 'LOST', 'INCOMPLETE'].includes(conditionInput)
            ? conditionInput
            : 'GOOD';

        let nextStatus = 'AVAILABLE';
        if (nextCondition === 'LOST') nextStatus = 'DISPOSED';
        else if (nextCondition === 'DAMAGED' || nextCondition === 'INCOMPLETE') nextStatus = 'REPAIR';

        const updated = await reusableRepo.updateReusableUnit(
            id,
            {
                status: nextStatus,
                condition: nextCondition === 'INCOMPLETE' ? 'DAMAGED' : nextCondition,
                department_id: null,
                ...(Object.prototype.hasOwnProperty.call(data, 'note') && { note: data.note || null }),
            },
            tx
        );

        await reusableRepo.createReusableUnitLog(
            {
                unit_id: id,
                action: 'RETURN_WITHDRAW_REUSABLE',
                from_department_id: existing.department_id || null,
                to_department_id: null,
                ref_doc_no: existing.movement_logs?.[0]?.ref_doc_no || null,
                note: data.note || 'รับกลับจากการใช้งานแผนก',
                performed_by: updatedById,
            },
            tx
        );

        return DTO.mapReusableUnitResponse(updated);
    });
};

const getReturnableWithdrawSummary = async (departmentId, tx = null) => {
    const deptId = Number(departmentId);
    if (!Number.isInteger(deptId) || deptId <= 0) {
        throw createHttpError(400, 'department_id is required');
    }

    const units = await reusableRepo.selectInUseUnitsByDepartment(deptId, tx || undefined);

    const grouped = new Map();
    for (const unit of units) {
        const usageContext = inferUsageContextFromLog(unit.movement_logs?.[0] || null);
        if (usageContext !== 'WITHDRAW') continue;

        if (!grouped.has(unit.item_id)) {
            grouped.set(unit.item_id, {
                item_id: unit.item_id,
                item_code: unit.items?.code || null,
                item_name: unit.items?.name || null,
                in_use_qty: 0,
            });
        }

        grouped.get(unit.item_id).in_use_qty += 1;
    }

    return {
        department_id: deptId,
        items: Array.from(grouped.values()).sort((a, b) => (a.item_name || '').localeCompare(b.item_name || '')),
    };
};

const createReturnRequest = async (payload = {}, userSession = null) => {
    const departmentId = Number(payload.department_id);
    if (!Number.isInteger(departmentId) || departmentId <= 0) {
        throw createHttpError(400, 'department_id is required');
    }

    const reqItems = Array.isArray(payload.items) ? payload.items : [];
    if (!reqItems.length) {
        throw createHttpError(400, 'items must be a non-empty array');
    }

    const requestedBy = userSession?.user_id || null;

    return reusableRepo.withTransaction(async (tx) => {
        const docNo = await generateReturnRequestDocNo(tx);
        const availableSummary = await getReturnableWithdrawSummary(departmentId, tx);
        const availableMap = new Map(availableSummary.items.map((item) => [item.item_id, item.in_use_qty]));
        const pendingRows = await reusableRepo.sumPendingReturnRequestQtyByDepartment(
            {
                departmentId,
                statuses: [RETURN_REQUEST_STATUS.REQUESTED, RETURN_REQUEST_STATUS.PROCESSING],
            },
            tx
        );
        const pendingMap = new Map((pendingRows || []).map((row) => [row.item_id, Number(row._sum?.requested_qty || 0)]));

        const aggregated = new Map();

        reqItems.forEach((item, idx) => {
            const itemId = (item?.item_id || '').toString().trim();
            const requestedQty = Number(item?.requested_qty);

            if (!itemId) {
                throw createHttpError(400, `items[${idx}].item_id is required`);
            }

            if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
                throw createHttpError(400, `items[${idx}].requested_qty must be a positive integer`);
            }

            if (!aggregated.has(itemId)) {
                aggregated.set(itemId, {
                    item_id: itemId,
                    requested_qty: 0,
                    note: item?.note || null,
                });
            }

            const current = aggregated.get(itemId);
            current.requested_qty += requestedQty;
            if (!current.note && item?.note) {
                current.note = item.note;
            }
        });

        const normalizedItems = Array.from(aggregated.values()).map((item) => {
            const itemId = item.item_id;
            const requestedQty = Number(item.requested_qty);

            const availableQty = Number(availableMap.get(itemId) || 0);
            const pendingQty = Number(pendingMap.get(itemId) || 0);
            const remainingQty = Math.max(0, availableQty - pendingQty);

            if (requestedQty > remainingQty) {
                throw createHttpError(
                    400,
                    `item_id ${itemId} requested_qty exceeds remaining returnable quantity (requested ${requestedQty}, remaining ${remainingQty}, pending ${pendingQty})`
                );
            }

            return {
                item_id: itemId,
                requested_qty: requestedQty,
                note: item.note || null,
            };
        });

        const header = await reusableRepo.createReturnRequestHeader(
            {
                doc_no: docNo,
                department_id: departmentId,
                preferred_pickup_at: payload.preferred_pickup_at ? new Date(payload.preferred_pickup_at) : null,
                contact_name: payload.contact_name || null,
                contact_phone: payload.contact_phone || null,
                note: payload.note || null,
                status: RETURN_REQUEST_STATUS.REQUESTED,
                requested_by: requestedBy,
            },
            tx
        );

        await reusableRepo.createReturnRequestItems(
            normalizedItems.map((item) => ({
                request_id: header.id,
                item_id: item.item_id,
                requested_qty: item.requested_qty,
                note: item.note,
            })),
            tx
        );

        const full = await reusableRepo.selectReturnRequestById(header.id, tx);
        return DTO.mapReturnRequestResponse(full);
    });
};

const getReturnRequests = async (query = {}) => {
    const [items, total] = await reusableRepo.selectReturnRequests(query);
    const totalPages = Math.max(1, Math.ceil(total / query.limit));

    return {
        items: items.map(DTO.mapReturnRequestResponse),
        total,
        page: query.page,
        limit: query.limit,
        totalPages,
        nextPage: query.page < totalPages ? query.page + 1 : null,
        prevPage: query.page > 1 ? query.page - 1 : null,
    };
};

const getReturnRequestById = async (id) => {
    const request = await reusableRepo.selectReturnRequestById(id);
    if (!request || request.deleted_at) {
        throw createHttpError(404, 'return request not found');
    }

    const mapped = DTO.mapReturnRequestResponse(request);
    return enrichReturnRequestWithUnitDetails(mapped);
};

const processReturnRequest = async (id, payload = {}, userSession = null) => {
    const processedBy = userSession?.user_id || null;
    const itemResults = Array.isArray(payload?.items) ? payload.items : [];
    const unitResults = Array.isArray(payload?.units) ? payload.units : [];

    if (!itemResults.length && !unitResults.length) {
        throw createHttpError(400, 'items or units must be a non-empty array');
    }

    return reusableRepo.withTransaction(async (tx) => {
        const request = await reusableRepo.selectReturnRequestById(id, tx);
        if (!request || request.deleted_at) {
            throw createHttpError(404, 'return request not found');
        }

        const currentStatus = (request.status || '').toString().trim().toUpperCase();
        if (currentStatus === RETURN_REQUEST_STATUS.COMPLETED) {
            throw createHttpError(400, 'return request is already completed');
        }

        const requestItemMap = new Map((request.request_items || []).map((item) => [item.item_id, item]));

        if (unitResults.length) {
            const mappedRequest = await enrichReturnRequestWithUnitDetails(DTO.mapReturnRequestResponse(request), tx);
            const requestedCodeToItemId = new Map();
            const requestedQtyByItem = new Map();

            (mappedRequest.items || []).forEach((item) => {
                requestedQtyByItem.set(item.item_id, Number(item.requested_qty || 0));
                (item.requested_unit_codes || []).forEach((code) => requestedCodeToItemId.set(code, item.item_id));
            });

            if (!requestedCodeToItemId.size) {
                throw createHttpError(400, 'request does not contain unit-level details; process with item summary instead');
            }

            const uniqueUnitIds = Array.from(
                new Set(
                    unitResults
                        .map((row) => (row?.unit_id || '').toString().trim())
                        .filter(Boolean)
                )
            );

            if (uniqueUnitIds.length !== unitResults.length) {
                throw createHttpError(400, 'units contains duplicate or invalid unit_id');
            }

            const candidateUnits = await reusableRepo.selectInUseWithdrawUnitsByIds(
                {
                    departmentId: request.department_id,
                    unitIds: uniqueUnitIds,
                },
                tx
            );

            const withdrawUnits = (candidateUnits || []).filter((unit) => inferUsageContextFromLog(unit.movement_logs?.[0] || null) === 'WITHDRAW');
            const withdrawUnitById = new Map(withdrawUnits.map((unit) => [unit.id, unit]));
            const selectedQtyByItem = new Map();

            for (let idx = 0; idx < unitResults.length; idx += 1) {
                const row = unitResults[idx] || {};
                const unitId = (row.unit_id || '').toString().trim();
                if (!unitId) {
                    throw createHttpError(400, `units[${idx}].unit_id is required`);
                }

                const unit = withdrawUnitById.get(unitId);
                if (!unit) {
                    throw createHttpError(400, `units[${idx}] unit not found in department withdraw in-use stock`);
                }

                const requestedItemId = requestedCodeToItemId.get(unit.unit_code);
                if (!requestedItemId) {
                    throw createHttpError(400, `units[${idx}] (${unit.unit_code}) does not belong to this return request`);
                }
                if (requestedItemId !== unit.item_id) {
                    throw createHttpError(400, `units[${idx}] item mismatch for requested unit ${unit.unit_code}`);
                }

                const nextCount = Number(selectedQtyByItem.get(unit.item_id) || 0) + 1;
                const requestedQty = Number(requestedQtyByItem.get(unit.item_id) || 0);
                if (nextCount > requestedQty) {
                    throw createHttpError(400, `units[${idx}] exceeds requested_qty for item ${unit.item_id}`);
                }
                selectedQtyByItem.set(unit.item_id, nextCount);
            }

            for (let idx = 0; idx < unitResults.length; idx += 1) {
                const row = unitResults[idx] || {};
                const unitId = (row.unit_id || '').toString().trim();
                const unit = withdrawUnitById.get(unitId);
                const nextState = getReusableReturnState(row.condition || 'GOOD');

                await reusableRepo.updateReusableUnit(
                    unit.id,
                    {
                        status: nextState.status,
                        condition: nextState.condition,
                        department_id: null,
                        ...(Object.prototype.hasOwnProperty.call(row, 'note') && { note: row.note || null }),
                    },
                    tx
                );

                await reusableRepo.createReusableUnitLog(
                    {
                        unit_id: unit.id,
                        action: 'RETURN_WITHDRAW_REUSABLE',
                        from_department_id: request.department_id || null,
                        to_department_id: null,
                        ref_doc_no: request.doc_no,
                        note: `RETURN_REQUEST:${request.doc_no} | ${unit.unit_code} | ${nextState.condition}${row.note ? ` | ${row.note}` : ''}`,
                        performed_by: processedBy,
                    },
                    tx
                );
            }
        } else {
            for (let idx = 0; idx < itemResults.length; idx += 1) {
                const result = itemResults[idx] || {};
                const itemId = (result.item_id || '').toString().trim();
                const returnQty = Number(result.return_qty);

                if (!itemId) {
                    throw createHttpError(400, `items[${idx}].item_id is required`);
                }
                if (!Number.isInteger(returnQty) || returnQty <= 0) {
                    throw createHttpError(400, `items[${idx}].return_qty must be a positive integer`);
                }

                const requestItem = requestItemMap.get(itemId);
                if (!requestItem) {
                    throw createHttpError(400, `items[${idx}] does not belong to this return request`);
                }
                if (returnQty > Number(requestItem.requested_qty || 0)) {
                    throw createHttpError(400, `items[${idx}] return_qty exceeds requested_qty (${requestItem.requested_qty})`);
                }

                const candidateUnits = await reusableRepo.selectInUseWithdrawUnitsByDeptAndItem(
                    {
                        departmentId: request.department_id,
                        itemId,
                        take: returnQty,
                    },
                    tx
                );

                const withdrawUnits = (candidateUnits || []).filter((unit) => inferUsageContextFromLog(unit.movement_logs?.[0] || null) === 'WITHDRAW');
                if (withdrawUnits.length < returnQty) {
                    throw createHttpError(400, `items[${idx}] in-use withdraw units are not enough (need ${returnQty}, found ${withdrawUnits.length})`);
                }

                const nextState = getReusableReturnState(result.condition || 'GOOD');

                for (const unit of withdrawUnits.slice(0, returnQty)) {
                    await reusableRepo.updateReusableUnit(
                        unit.id,
                        {
                            status: nextState.status,
                            condition: nextState.condition,
                            department_id: null,
                            ...(Object.prototype.hasOwnProperty.call(result, 'note') && { note: result.note || null }),
                        },
                        tx
                    );

                    await reusableRepo.createReusableUnitLog(
                        {
                            unit_id: unit.id,
                            action: 'RETURN_WITHDRAW_REUSABLE',
                            from_department_id: request.department_id || null,
                            to_department_id: null,
                            ref_doc_no: request.doc_no,
                            note: `RETURN_REQUEST:${request.doc_no}${result.note ? ` | ${result.note}` : ''}`,
                            performed_by: processedBy,
                        },
                        tx
                    );
                }
            }
        }

        const updated = await reusableRepo.updateReturnRequestById(
            id,
            {
                status: payload.complete === false ? RETURN_REQUEST_STATUS.PROCESSING : RETURN_REQUEST_STATUS.COMPLETED,
                ...(Object.prototype.hasOwnProperty.call(payload, 'note') && { note: payload.note || request.note || null }),
            },
            tx
        );

        return DTO.mapReturnRequestResponse(updated);
    });
};

const deleteReturnRequest = async (id) => {
    return reusableRepo.withTransaction(async (tx) => {
        const request = await reusableRepo.selectReturnRequestById(id, tx);
        if (!request || request.deleted_at) {
            throw createHttpError(404, 'return request not found');
        }

        const currentStatus = (request.status || '').toString().trim().toUpperCase();
        if (currentStatus === RETURN_REQUEST_STATUS.COMPLETED) {
            throw createHttpError(400, 'cannot delete completed return request');
        }

        const deleted = await reusableRepo.updateReturnRequestById(
            id,
            {
                deleted_at: new Date(),
            },
            tx
        );

        return DTO.mapReturnRequestResponse(deleted);
    });
};

const resolveBarcode = async ({ value, departmentId = null } = {}) => {
    const key = (value || '').toString().trim();
    if (!key) {
        throw createHttpError(400, 'value is required');
    }

    const unit = await reusableRepo.selectUnitByBarcodeValue({ value: key, departmentId });
    if (unit) {
        return {
            type: 'UNIT',
            value: key,
            unit: {
                id: unit.id,
                unit_code: unit.unit_code,
                serial_no: unit.serial_no || null,
                item_id: unit.item_id,
                item_code: unit.items?.code || null,
                item_name: unit.items?.name || null,
                department_id: unit.department_id || null,
                status: unit.status,
                condition: unit.condition,
            },
        };
    }

    const lot = await reusableRepo.selectLotByBarcodeValue({ value: key });
    if (lot) {
        return {
            type: 'LOT',
            value: key,
            lot: {
                id: lot.id,
                lot_code: lot.lot_code,
                item_id: lot.item_id,
                item_code: lot.items?.code || null,
                item_name: lot.items?.name || null,
                quantity: Number(lot.quantity || 0),
                status: lot.status,
                expired_at: lot.expired_at || null,
            },
        };
    }

    const item = await reusableRepo.selectItemByBarcodeValue({ value: key });
    if (item) {
        return {
            type: 'ITEM',
            value: key,
            item: {
                id: item.id,
                code: item.code,
                name: item.name,
                type: item.type,
                current_stock: Number(item.current_stock || 0),
                status: item.status,
                warehouse_id: item.warehouse_id || null,
            },
        };
    }

    return null;
};

module.exports = {
    createReusableReceive,
    getReusableUnits,
    getReusableUnitById,
    updateReusableUnit,
    returnReusableFromWithdraw,
    getReturnableWithdrawSummary,
    createReturnRequest,
    getReturnRequests,
    getReturnRequestById,
    processReturnRequest,
    deleteReturnRequest,
    resolveBarcode,
};
