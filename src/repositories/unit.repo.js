const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const buildUnitWhere = (keyword = '') => {
	const where = { deleted_at: null };
	if (!keyword) return where;

	where.OR = [
		{ name: { contains: keyword, mode: 'insensitive' } },
		{ description: { contains: keyword, mode: 'insensitive' } },
	];

	return where;
};

const SelectAllUnits = ({ page = 1, limit = 10, keyword = '' } = {}) => {
	const where = buildUnitWhere(keyword);
	const skip = (page - 1) * limit;

	return prisma.$transaction([
		prisma.units.findMany({
			where,
			orderBy: { id: 'desc' },
			skip,
			take: limit,
		}),
		prisma.units.count({ where }),
	]);
};

const SelectUnitById = (id, data = {}) => prisma.units.findFirst({
	where: { id, deleted_at: null },
	...data
});

const createUnit = (data) => prisma.units.create({ data });

const updateUnit = (id, data) => prisma.units.update({
	where: { id, deleted_at: null },
	data
});

const selectOptions = () => prisma.units.findMany({
	where: { deleted_at: null },
	orderBy: { name: 'asc' },
	select: { id: true, name: true }
});

module.exports = {
	SelectAllUnits,
	SelectUnitById,
	createUnit,
	updateUnit,
	selectOptions,
}