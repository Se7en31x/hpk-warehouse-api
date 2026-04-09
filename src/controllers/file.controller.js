const fileService = require('../services/file.service');
const util = require('../utils/response');

const updateItemImage = async (req, res) => {
	try {
		const { id } = req.params;
		if (!req.file) {
			return util.sendResponse(res, 400, 'No image file provided');
		}

		const updatedItem = await fileService.updateItemImage(id, req.file.buffer);
		req.io.emit('REFRESH_DATA', 'ITEMS');

		return util.sendMutationResponse(res, 200, 'Update item image success', updatedItem?.id || id);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
};

const removeItemImage = async (req, res) => {
	try {
		const { id } = req.params;
		await fileService.removeItemImage(id);
		req.io.emit('REFRESH_DATA', 'ITEMS');
		return util.sendMutationResponse(res, 200, 'Remove item image success', id);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
};

module.exports = {
	updateItemImage,
	removeItemImage,
};
