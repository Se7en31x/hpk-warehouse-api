const unitService = require('../services/unit.service')
const util = require('../utils/response');

const parseListQuery = (query) => {
	const page = Math.max(1, Number(query.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
	const keyword = (query.keyword || '').toString().trim();
	return { page, limit, keyword };
};

const getUnits = async (req, res) => {
	try {
		const query = parseListQuery(req.query);
		const units = await unitService.getAllUnits(query);
		return util.sendListResponse(res, 200, 'List all units success', units);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
}

const getUnitById = async (req, res) => {
	try {
		const { id } = req.params;
		if (!id) {
			return util.sendResponse(res, 400, 'Invalid this parameter');
		}

		const unit = await unitService.getUnitById(id);
		return util.sendResponse(res, 200, 'List unit by id success', unit);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
}

const getUnitOption = async (req, res) => {
	try {
		const data = await unitService.getUnitOption();
		return util.sendResponse(res, 200, 'List unit options success', data);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
}

const createUnit = async (req, res) => {
	try {
		const data = req.body;
		if (!data) {
			return util.sendResponse(res, 400, 'Invalid body data');
		}

		const newUnit = await unitService.createUnit(data);
		req.io.emit('REFRESH_DATA', 'UNITS');

		return util.sendMutationResponse(res, 201, 'Create unit success', newUnit?.id || null);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
}

const updateUnit = async (req, res) => {
	try {
		const { id } = req.params;
		const data = req.body;
		if (!data) {
			return sendResponse(res, 400, 'Invalid body data');
		}

		const updatedUnit = await unitService.updateUnit(id, data);
		req.io.emit('REFRESH_DATA', 'UNITS');

		return util.sendMutationResponse(res, 200, 'Update unit success', updatedUnit?.id || id);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
}

const softDeletedUnit = async (req, res) => {
	try {
		const { id } = req.params;
		if (!id) {
			return util.sendResponse(res, 400, 'Invalid this parameter');
		}

		const deletedUnit = await unitService.softDeletedUnit(id);
		req.io.emit('REFRESH_DATA', 'UNITS');

		return util.sendMutationResponse(res, 200, 'Delete unit success', deletedUnit?.id || id);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
}

module.exports = {
	getUnits,
	getUnitById,
	getUnitOption,
	createUnit,
	updateUnit,
	softDeletedUnit,
}