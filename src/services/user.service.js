const repo = require('../repositories/user.repo');

const getAll = async ({ page = 1, limit = 10, keyword = '' } = {}) => {
	const [items, total] = await repo.selectAll({ page, limit, keyword });
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
};

const getById = async (id) => {
	const dept = await repo.selectById(id);
	if (!dept) throw new Error('Department not found');
	return dept;
};

const getOptions = () => repo.selectOptions();

module.exports = {
	getAll,
	getById,
	getOptions,
};
