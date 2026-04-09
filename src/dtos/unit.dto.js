const updateUnitDTO = (data = {}) => {
	const payload = {};

	if (Object.prototype.hasOwnProperty.call(data, 'name')) {
		payload.name = data.name;
	}
	if (Object.prototype.hasOwnProperty.call(data, 'description')) {
		payload.description = data.description;
	}

	return payload;
};

const softDeleteDTO = () => ({
	deleted_at: new Date(),
});

module.exports = {
	updateUnitDTO,
	softDeleteDTO,
};
