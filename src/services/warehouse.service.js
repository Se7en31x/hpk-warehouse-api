const warehouseRepo = require('../repositories/warehouse.repo')
const DTO = require('../dtos/warehouse.dto')

const getAllWarehouses = async ({ page = 1, limit = 10, keyword = '' } = {}) => {
	const [items, total] = await warehouseRepo.SelectAllWarehouses({ page, limit, keyword });
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

const getWarehouseById = async (id) => {
	const warehouse = await warehouseRepo.SelectWarehouseById(id);
	if (!warehouse) throw new Error('Warehouse id not found');
	return warehouse;
}

const createWarehouse = async (data) => {
	const newWarehouse = await warehouseRepo.createWarehouse(data);
	return newWarehouse;
}

const updateWarehouse = async (id, data) => {
	const existingWarehouse = await warehouseRepo.SelectWarehouseById(id);
	if (!existingWarehouse) throw new Error('Warehouse id not found');

	const payload = DTO.updateWarehouseDTO(data);
	const updatedWarehouse = await warehouseRepo.updateWarehouse(id, payload);
	return updatedWarehouse;
}

const softDeletedWarehouse = async (id) => {
	const existingWarehouse = await warehouseRepo.SelectWarehouseById(id);
	if (!existingWarehouse) throw new Error('Warehouse id not found');

	const payload = DTO.softDeleteDTO();
	const deletedWarehouse = await warehouseRepo.updateWarehouse(id, payload);
	return deletedWarehouse;
}

const getWarehouseOption = async () => {
	const options = await warehouseRepo.selectOptions();
	return options;
}

module.exports = {
	getAllWarehouses,
	getWarehouseById,
	createWarehouse,
	updateWarehouse,
	softDeletedWarehouse,
	getWarehouseOption,
}

