const supplierRepo = require('../repositories/supplier.repo')

const getAllSuppliers = async ({ page = 1, limit = 10, keyword = '' } = {}) => {
	const [items, total] = await supplierRepo.selectAllSuppliers({ page, limit, keyword });
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

const getSupplierById = async (id) => {
	const supplier = await supplierRepo.selectSupplierById(id);
	if (!supplier) throw new Error('Supplier id not found');
	return supplier;
}

const createSupplier = async (data) => {
	const newSupplier = await supplierRepo.createSupplier(data);
	return newSupplier;
}

const updateSupplier = async (id, data) => {
	const existing = await supplierRepo.selectSupplierById(id);
	if (!existing) throw new Error('Supplier id not found');

	const payload = {};
	if (Object.prototype.hasOwnProperty.call(data, 'name')) payload.name = data.name;
	if (Object.prototype.hasOwnProperty.call(data, 'contact')) payload.contact = data.contact;
	if (Object.prototype.hasOwnProperty.call(data, 'address')) payload.address = data.address;
	if (Object.prototype.hasOwnProperty.call(data, 'phone')) payload.phone = data.phone;
	if (Object.prototype.hasOwnProperty.call(data, 'tax_id')) payload.tax_id = data.tax_id;

	const updated = await supplierRepo.updateSupplier(id, payload);
	return updated;
}

const softDeleteSupplier = async (id) => {
	const existing = await supplierRepo.selectSupplierById(id);
	if (!existing) throw new Error('Supplier id not found');

	const deleted = await supplierRepo.updateSupplier(id, { active: false });
	return deleted;
}

const getSupplierOption = async () => {
	const options = await supplierRepo.selectOptions();
	return options;
}

module.exports = {
	getAllSuppliers,
	getSupplierById,
	createSupplier,
	updateSupplier,
	softDeleteSupplier,
	getSupplierOption,
}