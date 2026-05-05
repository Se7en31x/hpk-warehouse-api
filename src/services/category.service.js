const categoryRepo = require('../repositories/category.repo')
const DTO = require('../dtos/category.dto')

const assertCategoryUnique = async ({ name, codePrefix, excludeId }) => {
	const n = (name || '').trim();
	const p = (codePrefix || '').trim().toUpperCase();
	const byName = await categoryRepo.findActiveCategoryByName(n, excludeId);
	if (byName) {
		const err = new Error('ชื่อประเภทพัสดุนี้ซ้ำกับรายการอื่น');
		err.statusCode = 409;
		throw err;
	}
	const byPrefix = await categoryRepo.findActiveCategoryByCodePrefix(p, excludeId);
	if (byPrefix) {
		const err = new Error('Prefix Code (คำนำหน้ารหัส) นี้ซ้ำกับรายการอื่น');
		err.statusCode = 409;
		throw err;
	}
};

const getAllCategories = async ({ page = 1, limit = 10, keyword = '' } = {}) => {
	const [items, total] = await categoryRepo.SelectAllCategories({ page, limit, keyword });
	const totalPages = Math.max(1, Math.ceil(total / limit));

	return {
		items,
		total,
		page,
		limit,
		totalPages,
		nextPage: page < totalPages ? page + 1 : null,
		prevPage: page > 1 ? page - 1 : null,
	};
}

const getCategoryById = async (id) => {
	const category = await categoryRepo.SelectCategoryById(id);
	if (!category) throw new Error('Category id not found');
	return category;
}

const createCategory = async (data) => {
	const payload = DTO.createCategoryDTO(data);
	await assertCategoryUnique({
		name: payload.name,
		codePrefix: payload.code_prefix,
		excludeId: null,
	});
	const newCategory = await categoryRepo.createCategory(payload);
	return newCategory;
}

const updateCategory = async (id, data) => {
	const existingCategory = await categoryRepo.SelectCategoryById(id);
	if (!existingCategory) throw new Error('Category id not found');

	const payload = DTO.updateCategoryDTO(data);
	const nextName = Object.prototype.hasOwnProperty.call(payload, 'name')
		? payload.name
		: existingCategory.name;
	const nextPrefix = Object.prototype.hasOwnProperty.call(payload, 'code_prefix')
		? payload.code_prefix
		: existingCategory.code_prefix;

	await assertCategoryUnique({
		name: (nextName || '').toString().trim(),
		codePrefix: (nextPrefix || '').toString().trim().toUpperCase(),
		excludeId: id,
	});

	const updatedCategory = await categoryRepo.updateCategory(id, payload);
	return updatedCategory
}

const softDeletedCategory = async (id) => {
	const existingCategory = await categoryRepo.SelectCategoryById(id);
	if (!existingCategory) throw new Error('Category id not found');

	const payload = DTO.softDeleteDTO();
	const deletedCategory = await categoryRepo.updateCategory(id, payload);
	return deletedCategory;
}

const getCategoryOption = async () => {
	const options = await categoryRepo.selectOptions();
	return options;
}

module.exports = {
	getAllCategories,
	getCategoryById,
	createCategory,
	updateCategory,
	softDeletedCategory,
	getCategoryOption,
}
