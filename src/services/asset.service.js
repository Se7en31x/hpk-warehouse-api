const assetRepo = require('../repositories/asset.repo');
const { isAdmin, getUserDepartmentIds } = require('../utils/userAccess');

const createHttpError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const mapAssetResponse = (asset) => ({
    id: asset.id,
    asset_code: asset.asset_code,
    item_id: asset.item_id,
    item_name: asset.items?.name || null,
    item_code: asset.items?.code || null,
    serial_no: asset.serial_no || null,
    department_id: asset.department_id || null,
    department_name: asset.departments?.name || null, 
    status: asset.status,
    purchase_date: asset.purchase_date || null,
    warranty_expire: asset.warranty_expire || null,
    note: asset.note || null,
    receive_doc_no: asset.receive_item?.receive_header?.doc_no || null,
    created_at: asset.created_at,
    updated_at: asset.updated_at,
});

/**
 * List assets with role-based access control.
 * Admin: sees all assets across the system.
 * Non-admin: sees only assets belonging to their departments (unless an explicit
 *            department_id filter is already provided).
 *
 * @param {object} filters
 * @param {object|null} userSession  req.user
 */
const getAssets = async ({
    page = 1,
    limit = 10,
    keyword = '',
    department_id = '',
    status = '',
    item_id = '',
} = {}, userSession = null) => {
    const parsedPage  = Math.max(1, Number(page));
    const parsedLimit = Math.max(1, Number(limit));

    // Resolve department filtering
    let resolvedDepartmentId = department_id ? Number(department_id) : null;
    let department_ids = [];

    if (!isAdmin(userSession)) {
        department_ids = getUserDepartmentIds(userSession);
        // Explicit dept filter from query is allowed only when it's in the user's own depts
        if (resolvedDepartmentId && department_ids.length > 0 && !department_ids.includes(resolvedDepartmentId)) {
            resolvedDepartmentId = null; // ignore invalid explicit filter; fall back to dept list
        }
    }

    const queryParams = {
        page: parsedPage,
        limit: parsedLimit,
        keyword,
        status,
        item_id,
        department_id: resolvedDepartmentId,
        department_ids,   // repo applies IN filter when no single dept is specified
    };

    const [items, total] = await assetRepo.selectAllAssets(queryParams);
    const totalPages = Math.max(1, Math.ceil(total / parsedLimit));

    return {
        items: items.map(mapAssetResponse),
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages,
        nextPage: parsedPage < totalPages ? parsedPage + 1 : null,
        prevPage: parsedPage > 1 ? parsedPage - 1 : null,
    };
};

const getAssetById = async (id) => {
    const asset = await assetRepo.selectAssetById(id);
    if (!asset) throw createHttpError(404, 'Asset not found');
    return mapAssetResponse(asset);
};

const updateAsset = async (id, data) => {
    const asset = await assetRepo.selectAssetById(id);
    if (!asset) throw createHttpError(404, 'Asset not found');

    const VALID_STATUSES = ['READY', 'IN_USE', 'REPAIR', 'DISPOSED'];
    if (data.status && !VALID_STATUSES.includes(data.status)) {
        throw createHttpError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    const updatePayload = {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.serial_no !== undefined && { serial_no: data.serial_no }),
        ...(data.department_id !== undefined && { 
            department_id: data.department_id ? Number(data.department_id) : null 
        }),
        ...(data.note !== undefined && { note: data.note }),
        ...(data.warranty_expire !== undefined && { 
            warranty_expire: data.warranty_expire ? new Date(data.warranty_expire) : null 
        }),
    };

    const updated = await assetRepo.updateAsset(id, updatePayload);

    return mapAssetResponse(updated);
};

module.exports = {
    getAssets,
    getAssetById,
    updateAsset,
    mapAssetResponse,
};