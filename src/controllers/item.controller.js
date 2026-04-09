const itemService = require('../services/item.service')
const util = require('../utils/response');

const parseListQuery = (query) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const keyword = (query.keyword || '').toString().trim();
    const start_date = (query.start_date || '').toString().trim();
    const end_date = (query.end_date || '').toString().trim();
    const type = (query.type || '').toString().trim();

    let allowed_req = undefined;
    if (query.allowed_req !== undefined && query.allowed_req !== '') {
        allowed_req = query.allowed_req === 'true'; 
    }

    let allowed_borrow = undefined;
    if (query.allowed_borrow !== undefined && query.allowed_borrow !== '') {
        allowed_borrow = query.allowed_borrow === 'true';
    }

    return { 
        page, limit, keyword, start_date, end_date, type, 
        allowed_req, allowed_borrow 
    };
};

const getItems = async (req, res) => {
    try {
        const query = parseListQuery(req.query);
        const items = await itemService.getAllItems(query);
        return util.sendListResponse(res, 200, "List all items success", items);
    } catch (error) {
        return util.sendResponse(res, 500, error.message);
    }
};

const getItemById = async (req, res) => {
    try {
        // validator parameter 
        const { id } = req.params;
        if (!id) {
            return util.sendResponse(res, 400, "Invalid this parameter");
        }

        const item = await itemService.getItemById(id)
        return util.sendResponse(res, 200, "List item by id success", item)

    } catch (error) {
        return util.sendResponse(res, 500, error.message);
    }
}

const getItemOption = async (req, res) => {
    try {
        const data = await itemService.getItemOption()
        return util.sendResponse(res, 200, "list item options success", data)
    } catch (error) {
        return util.sendResponse(res, 500, error.message);
    }
}

const createItem = async (req, res) => {
    try {
        const data = req.body
        if (!data) {
            return util.sendResponse(res, 400, "Invalid body data")
        }

        const newItem = await itemService.createItem(data, req.file || null)
        req.io.emit('REFRESH_DATA', 'ITEMS');

        return util.sendMutationResponse(res, 201, "create item success", newItem?.id || null)
    } catch (error) {
        return util.sendResponse(res, 500, error.message);
    }
}

const updateItem = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        if (!data) {
            return util.sendResponse(res, 400, "Invalid body data")
        }

        const updatedItem = await itemService.updateItem(id, data);
        req.io.emit('REFRESH_DATA', 'ITEMS');

        return util.sendMutationResponse(res, 200, "update item success", updatedItem?.id || id)
    } catch (error) {
        return util.sendResponse(res, 500, error.message);
    }
}

const softDeletedItem = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return util.sendResponse(res, 400, "Invalid this parameter");
        }
        const deletedItem = await itemService.softDeletedItem(id)

        req.io.emit('REFRESH_DATA', 'ITEMS');

        return util.sendMutationResponse(res, 200, "delete item success", deletedItem?.id || id)
    } catch (error) {
        return util.sendResponse(res, 500, error.message);
    }
}

module.exports = {
    getItems,
    getItemById,
    createItem,
    getItemOption,
    softDeletedItem,
    updateItem,
}