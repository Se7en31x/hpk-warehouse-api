const VALID_ITEM_TYPES = ['CONSUMABLE', 'REUSABLE', 'MED_ASSET'];

const normalizeItemType = (value) => {
	const normalized = (value || '').toString().trim().toUpperCase();
	if (!normalized) return 'CONSUMABLE';
	if (normalized === 'ASSET') return 'MED_ASSET';
	return VALID_ITEM_TYPES.includes(normalized) ? normalized : 'CONSUMABLE';
};

const createCategoryDTO = (data = {}) => ({
	name: data.name,
	code_prefix: data.code_prefix,
	item_type: normalizeItemType(data.item_type),
	description: data.description || null,
});

const updateCategoryDTO = (data = {}) => {
	const payload = {};

	if (Object.prototype.hasOwnProperty.call(data, 'name')) {
		payload.name = data.name;
	}
	if (Object.prototype.hasOwnProperty.call(data, 'code_prefix')) {
		payload.code_prefix = data.code_prefix;
	}
	if (Object.prototype.hasOwnProperty.call(data, 'description')) {
		payload.description = data.description;
	}
	if (Object.prototype.hasOwnProperty.call(data, 'item_type')) {
		payload.item_type = normalizeItemType(data.item_type);
	}

	return payload;
};

const softDeleteDTO = () => ({
	deleted_at: new Date(),
});

module.exports = {
	createCategoryDTO,
	updateCategoryDTO,
	softDeleteDTO,
};
