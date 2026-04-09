const categoryService = require('../services/category.service')
const util = require('../utils/response');

const parseListQuery = (query) => {
	const page = Math.max(1, Number(query.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
	const keyword = (query.keyword || '').toString().trim();
	return { page, limit, keyword };
};

const getCategories = async (req, res) => {
	try {
		const query = parseListQuery(req.query);
		const categories = await categoryService.getAllCategories(query);
		return util.sendListResponse(res, 200, 'List all categories success', categories);
	} catch (error) {
		return util.sendResponse(res, 500, "failed to get categories");
	}
}

const getCategoryById = async (req, res) => {
	try {
		const { id } = req.params;
		if (!id) {
			return util.sendResponse(res, 400, 'Invalid this parameter');
		}

		const category = await categoryService.getCategoryById(id);
		return util.sendResponse(res, 200, 'List category by id success', category);
	} catch (error) {
		return util.sendResponse(res, 500, "failed to get category by ID");
	}
}

const getCategoryOption = async (req, res) => {
	try {
		const data = await categoryService.getCategoryOption();
		return util.sendResponse(res, 200, 'List category options success', data);
	} catch (error) {
		return util.sendResponse(res, 500, 'failed to get category options');
	}
}

const createCategory = async (req, res) => {
	try {
		const data = req.body;
		if (!data) {
			return util.sendResponse(res, 400, 'Invalid body data');
		}

		const newCategory = await categoryService.createCategory(data);
		req.io.emit('REFRESH_DATA', 'CATEGORIES');

		return util.sendMutationResponse(res, 201, 'Create category success', newCategory?.id || null);
	} catch (error) {
		return util.sendResponse(res, 500, "failed to create category");
	}
}

const updateCategory = async (req, res) => {
	try {
		const { id } = req.params;
		const data = req.body;
		if (!data) {
			return util.sendResponse(res, 400, 'Invalid body data');
		}

		const updatedCategory = await categoryService.updateCategory(id, data);
		req.io.emit('REFRESH_DATA', 'CATEGORIES');

		return util.sendMutationResponse(res, 200, 'Update category success', updatedCategory?.id || id);
	} catch (error) {
		return util.sendResponse(res, 500, "failed to update category");
	}
}

const softDeletedCategory = async (req, res) => {
	try {
		const { id } = req.params;
		if (!id) {
			return util.sendResponse(res, 400, 'Invalid this parameter');
		}

		const deletedCategory = await categoryService.softDeletedCategory(id);
		req.io.emit('REFRESH_DATA', 'CATEGORIES');

		return util.sendMutationResponse(res, 200, 'Delete category success', deletedCategory?.id || id);
	} catch (error) {
		return util.sendResponse(res, 500, "failed to delete category");
	}
}

module.exports = {
	getCategories,
	getCategoryById,
	getCategoryOption,
	createCategory,
	updateCategory,
	softDeletedCategory,
}