const svc  = require('../services/user.service');
const util = require('../utils/response');

const parseListQuery = (query) => ({
	page:    Math.max(1, Number(query.page)  || 1),
	limit:   Math.min(100, Math.max(1, Number(query.limit) || 10)),
	keyword: (query.keyword || '').toString().trim(),
});

const getAll = async (req, res) => {
	try {
		const data = await svc.getAll(parseListQuery(req.query));
		return util.sendListResponse(res, 200, 'List departments success', data);
	} catch (e) {
		return util.sendResponse(res, 500, e.message);
	}
};

const getById = async (req, res) => {
	try {
		const data = await svc.getById(req.params.id);
		return util.sendResponse(res, 200, 'Get department success', data);
	} catch (e) {
		return util.sendResponse(res, 404, e.message);
	}
};

const getOptions = async (req, res) => {
	try {
		const data = await svc.getOptions();
		return util.sendResponse(res, 200, 'List department options success', data);
	} catch (e) {
		return util.sendResponse(res, 500, e.message);
	}
};

module.exports = {
	getAll,
	getById,
	getOptions,
};
