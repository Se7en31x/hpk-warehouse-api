const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const buildSupplierWhere = (keyword = '') => {
	const where = { active: true };
	if (!keyword) return where;

	where.OR = [
		{ name: { contains: keyword, mode: 'insensitive' } },
		{ contact: { contains: keyword, mode: 'insensitive' } },
		{ address: { contains: keyword, mode: 'insensitive' } },
		{ phone: { contains: keyword, mode: 'insensitive' } },
		{ tax_id: { contains: keyword, mode: 'insensitive' } },
	];

	return where;
};

const selectAllSuppliers = ({ page = 1, limit = 10, keyword = '' } = {}) => {
	const where = buildSupplierWhere(keyword);
	const skip = (page - 1) * limit;

	return prisma.$transaction([
		prisma.supplier.findMany({
			where,
			orderBy: { created_at: 'desc' },
			skip,
			take: limit,
		}),
		prisma.supplier.count({ where }),
	]);
};

const selectSupplierById = (id) => prisma.supplier.findFirst({
	where: { id, active: true },
});

const createSupplier = (data) => prisma.supplier.create({ data });

const updateSupplier = (id, data) => prisma.supplier.update({
	where: { id },
	data: { ...data, updated_at: new Date() },
});

const selectOptions = () => prisma.supplier.findMany({
	where: { active: true },
	orderBy: { name: 'asc' },
	select: { id: true, name: true }
});

module.exports = {
	selectAllSuppliers,
	selectSupplierById,
	createSupplier,
	updateSupplier,
	selectOptions,
}