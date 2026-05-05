const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const buildCategoryWhere = (keyword = '') => {
	const where = { deleted_at: null };
	if (!keyword) return where;

	where.OR = [
		{ name: { contains: keyword, mode: 'insensitive' } },
		{ code_prefix: { contains: keyword, mode: 'insensitive' } },
		{ description: { contains: keyword, mode: 'insensitive' } },
	];

	return where;
};

const SelectAllCategories = ({ page = 1, limit = 10, keyword = '' } = {}) => {
	const where = buildCategoryWhere(keyword);
	const skip = (page - 1) * limit;

	return prisma.$transaction([
		prisma.categories.findMany({
			where,
			orderBy: { id: 'desc' },
			skip,
			take: limit,
		}),
		prisma.categories.count({ where }),
	]);
};

const SelectCategoryById = (id, data = {}) => prisma.categories.findFirst({
	where: { id, deleted_at: null },
	...data
});

const createCategory = (data) => prisma.categories.create({ data });

const updateCategory = (id, data) => prisma.categories.update({
	where: { id, deleted_at: null },
	data
});

const selectOptions = () => prisma.categories.findMany({
	where: { deleted_at: null },
	orderBy: { name: 'asc' },
	select: { id: true, name: true, item_type: true }
});

/** ชื่อซ้ำ (ไม่นับรายการที่ถูกลบ soft และไม่นับ excludeId) */
const findActiveCategoryByName = (name, excludeId = null) => {
	const where = {
		deleted_at: null,
		name: { equals: (name || '').trim(), mode: 'insensitive' },
	};
	if (excludeId) where.NOT = { id: excludeId };
	return prisma.categories.findFirst({ where });
};

/** คำนำหน้ารหัสซ้ำ (เทียบแบบ case-insensitive) */
const findActiveCategoryByCodePrefix = (codePrefix, excludeId = null) => {
	const where = {
		deleted_at: null,
		code_prefix: { equals: (codePrefix || '').trim(), mode: 'insensitive' },
	};
	if (excludeId) where.NOT = { id: excludeId };
	return prisma.categories.findFirst({ where });
};

module.exports = {
	SelectAllCategories,
	SelectCategoryById,
	createCategory,
	updateCategory,
	selectOptions,
	findActiveCategoryByName,
	findActiveCategoryByCodePrefix,
}