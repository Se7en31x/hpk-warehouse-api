const supplierService = require('../services/supplier.service')
const util = require('../utils/response');

const parseListQuery = (query) => {
	const page = Math.max(1, Number(query.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
	const keyword = (query.keyword || '').toString().trim();
	return { page, limit, keyword };
};

const getSuppliers = async (req, res) => {
	try {
		const query = parseListQuery(req.query);
		const suppliers = await supplierService.getAllSuppliers(query);
		return util.sendListResponse(res, 200, 'List all suppliers success', suppliers);
	} catch (error) {
		return util.sendResponse(res, 500, "failed to get suppliers");
	}
}

const getSupplierById = async (req, res) => {
	try {
		const { id } = req.params;
		if (!id) {
			return util.sendResponse(res, 400, 'Invalid this parameter');
		}

		const supplier = await supplierService.getSupplierById(id);
		return util.sendResponse(res, 200, 'List supplier by id success', supplier);
	} catch (error) {
		return util.sendResponse(res, 500, "failed to get supplier by ID");
	}
}

const getSupplierOption = async (req, res) => {
	try {
		const data = await supplierService.getSupplierOption();
		return util.sendResponse(res, 200, 'List supplier options success', data);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
}

const createSupplier = async (req, res) => {
	try {
		const data = req.body;
		if (!data) {
			return util.sendResponse(res, 400, 'Invalid body data');
		}

		const newSupplier = await supplierService.createSupplier(data);
		req.io.emit('REFRESH_DATA', 'SUPPLIERS');

		return util.sendMutationResponse(res, 201, 'Create supplier success', newSupplier?.id || null);
	} catch (error) {
		return util.sendResponse(res, 500, "failed to create supplier");
	}
}

const updateSupplier = async (req, res) => {
	try {
		const { id } = req.params;
		const data = req.body;
		if (!data) {
			return util.sendResponse(res, 400, 'Invalid body data');
		}

		const updated = await supplierService.updateSupplier(id, data);
		req.io.emit('REFRESH_DATA', 'SUPPLIERS');

		return util.sendMutationResponse(res, 200, 'Update supplier success', updated?.id || id);
	} catch (error) {
		return util.sendResponse(res, 500, "failed to update supplier");
	}
}

const softDeleteSupplier = async (req, res) => {
	try {
		const { id } = req.params;
		if (!id) {
			return util.sendResponse(res, 400, 'Invalid this parameter');
		}

		const deleted = await supplierService.softDeleteSupplier(id);
		req.io.emit('REFRESH_DATA', 'SUPPLIERS');

		return util.sendMutationResponse(res, 200, 'Delete supplier success', deleted?.id || id);
	} catch (error) {
		return util.sendResponse(res, 500, "failed to delete supplier");
	}
}

module.exports = {
	getSuppliers,
	getSupplierById,
	getSupplierOption,
	createSupplier,
	updateSupplier,
	softDeleteSupplier,
}