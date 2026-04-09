const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const buildWhere = (keyword = '') => {
	const where = { deleted_at: null, is_disable: { not: true } };
	if (!keyword) return where;
	where.OR = [
		{ name: { contains: keyword, mode: 'insensitive' } },
		{ description: { contains: keyword, mode: 'insensitive' } },
	];
	return where;
};

const selectAll = ({ page = 1, limit = 10, keyword = '' } = {}) => {
	const where = buildWhere(keyword);
	const skip = (page - 1) * limit;
	return prisma.$transaction([
		prisma.departments.findMany({
			where,
			orderBy: { name: 'asc' },
			skip,
			take: limit,
		}),
		prisma.departments.count({ where }),
	]);
};

const selectById = (id) => prisma.departments.findFirst({
	where: { id: Number(id), deleted_at: null },
});

const selectOptions = () => prisma.departments.findMany({
	where: { deleted_at: null, is_disable: { not: true } },
	orderBy: { name: 'asc' },
	select: { id: true, name: true },
});

module.exports = {
	selectAll,
	selectById,
	selectOptions,
};
