const itemRepo = require('../repositories/item.repo');
const { uploadToCloudinary } = require('../middleware/upload');
const cloudinary = require('../config/cloudinary');

const updateItemImage = async (id, buffer) => {
	const existingItem = await itemRepo.SelectItemPublicId(id);
	if (!existingItem) throw new Error('Item id not found');

	if (existingItem.image_public_id) {
		await cloudinary.uploader.destroy(existingItem.image_public_id).catch(() => {});
	}

	const result = await uploadToCloudinary(buffer, 'items');
	const updatedItem = await itemRepo.updateItem(id, {
		image_url: result.secure_url,
		image_public_id: result.public_id,
	});
	return updatedItem;
};

const removeItemImage = async (id) => {
	const existingItem = await itemRepo.SelectItemPublicId(id);
	if (!existingItem) throw new Error('Item id not found');

	if (existingItem.image_public_id) {
		await cloudinary.uploader.destroy(existingItem.image_public_id).catch(() => {});
	}

	return await itemRepo.updateItem(id, {
		image_url: null,
		image_public_id: null,
	});
};

module.exports = {
	updateItemImage,
	removeItemImage,
};
