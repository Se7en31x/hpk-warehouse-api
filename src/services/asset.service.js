const assetRepo = require('../repositories/asset.repo');

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

const getAssets = async ({ page = 1, limit = 10, keyword = '', department_id = '', status = '', item_id = '' } = {}) => {
    const [items, total] = await assetRepo.selectAllAssets({ page, limit, keyword, department_id, status, item_id });
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
        items: items.map(mapAssetResponse),
        total,
        page,
        limit,
        totalPages,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null,
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

    const updated = await assetRepo.updateAsset(id, {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.serial_no !== undefined && { serial_no: data.serial_no }),
        ...(data.department_id !== undefined && { department_id: data.department_id }),
        ...(data.note !== undefined && { note: data.note }),
        ...(data.warranty_expire !== undefined && { warranty_expire: data.warranty_expire ? new Date(data.warranty_expire) : null }),
    });

    return mapAssetResponse(updated);
};

module.exports = {
    getAssets,
    getAssetById,
    updateAsset,
    mapAssetResponse,
};
