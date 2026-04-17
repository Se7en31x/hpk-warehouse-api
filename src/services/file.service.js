const itemRepo = require('../repositories/item.repo');
const borrowerRepo = require('../repositories/requisition.repo');
const { uploadToCloudinary, uploadDocumentToCloudinary } = require('../middleware/upload');
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

const uploadBorrowerDocument = async (borrowerId, buffer) => {
	const existing = await borrowerRepo.getBorrowerById(borrowerId);
	if (!existing) throw new Error('Borrower not found');

	// Delete old Cloudinary asset if one exists
	if (existing.id_card_public_id) {
		await cloudinary.uploader.destroy(existing.id_card_public_id, { resource_type: 'auto' }).catch(() => {});
	}

	const result = await uploadDocumentToCloudinary(buffer, 'borrowers');
	console.log('[Cloudinary] uploadBorrowerDocument — resource_type:', result.resource_type, '| url:', result.secure_url);
	await borrowerRepo.updateBorrowerDocument(borrowerId, {
		id_card_url: result.secure_url,
		id_card_public_id: result.public_id,
	});

	return { id_card_url: result.secure_url };
};

module.exports = {
	updateItemImage,
	removeItemImage,
	uploadBorrowerDocument,
};
