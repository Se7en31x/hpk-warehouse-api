const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const buildWarehouseWhere = (keyword = '') => {
	const where = { deleted_at: null };
	if (!keyword) return where;

	where.OR = [
		{ name: { contains: keyword, mode: 'insensitive' } },
		{ location: { contains: keyword, mode: 'insensitive' } },
		{ description: { contains: keyword, mode: 'insensitive' } },
	];

	return where;
};

const SelectAllWarehouses = ({ page = 1, limit = 10, keyword = '' } = {}) => {
	const where = buildWarehouseWhere(keyword);
	const skip = (page - 1) * limit;

	return prisma.$transaction([
		prisma.warehouses.findMany({
			where,
			orderBy: { id: 'desc' },
			skip,
			take: limit,
		}),
		prisma.warehouses.count({ where }),
	]);
};

const SelectWarehouseById = (id, data = {}) => prisma.warehouses.findFirst({
	where: { id, deleted_at: null },
	...data
});

const createWarehouse = (data) => prisma.warehouses.create({ data });

const updateWarehouse = (id, data) => prisma.warehouses.update({
	where: { id, deleted_at: null },
	data
});

const selectOptions = () => prisma.warehouses.findMany({
	where: { deleted_at: null },
	orderBy: { name: 'asc' },
	select: { id: true, name: true }
});

module.exports = {
	SelectAllWarehouses,
	SelectWarehouseById,
	createWarehouse,
	updateWarehouse,
	selectOptions,
};

