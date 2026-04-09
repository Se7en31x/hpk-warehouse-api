const warehouseService = require('../services/warehouse.service')
const util = require('../utils/response');

const parseListQuery = (query) => {
	const page = Math.max(1, Number(query.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
	const keyword = (query.keyword || '').toString().trim();
	return { page, limit, keyword };
};

const getWarehouses = async (req, res) => {
	try {
		const query = parseListQuery(req.query);
		const warehouses = await warehouseService.getAllWarehouses(query);
		return util.sendListResponse(res, 200, 'List all warehouses success', warehouses);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
}

const getWarehouseById = async (req, res) => {
	try {
		const { id } = req.params;
		if (!id) {
			return util.sendResponse(res, 400, 'Invalid this parameter');
		}

		const warehouse = await warehouseService.getWarehouseById(id);
		return util.sendResponse(res, 200, 'List warehouse by id success', warehouse);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
}

const getWarehouseOption = async (req, res) => {
	try {
		const data = await warehouseService.getWarehouseOption();
		return util.sendResponse(res, 200, 'List warehouse options success', data);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
}

const createWarehouse = async (req, res) => {
	try {
		const data = req.body;
		if (!data) {
			return util.sendResponse(res, 400, 'Invalid body data');
		}

		const newWarehouse = await warehouseService.createWarehouse(data);
		req.io.emit('REFRESH_DATA', 'WAREHOUSES');

		return util.sendMutationResponse(res, 201, 'Create warehouse success', newWarehouse?.id || null);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
}

const updateWarehouse = async (req, res) => {
	try {
		const { id } = req.params;
		const data = req.body;
		if (!data) {
			return util.sendResponse(res, 400, 'Invalid body data');
		}

		const updatedWarehouse = await warehouseService.updateWarehouse(id, data);
		req.io.emit('REFRESH_DATA', 'WAREHOUSES');

		return util.sendMutationResponse(res, 200, 'Update warehouse success', updatedWarehouse?.id || id);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
}

const softDeletedWarehouse = async (req, res) => {
	try {
		const { id } = req.params;
		if (!id) {
			return util.sendResponse(res, 400, 'Invalid this parameter');
		}

		const deletedWarehouse = await warehouseService.softDeletedWarehouse(id);
		req.io.emit('REFRESH_DATA', 'WAREHOUSES');

		return util.sendMutationResponse(res, 200, 'Delete warehouse success', deletedWarehouse?.id || id);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
}

module.exports = {
	getWarehouses,
	getWarehouseById,
	getWarehouseOption,
	createWarehouse,
	updateWarehouse,
	softDeletedWarehouse,
}

