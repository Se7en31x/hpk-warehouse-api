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

const uploadBorrowerDocument = async (borrowerId, buffers) => {
	const existing = await borrowerRepo.getBorrowerById(borrowerId);
	if (!existing) throw new Error('Borrower not found');

	// Delete all previous Cloudinary assets
	const oldPublicIds = (() => {
		try { return JSON.parse(existing.id_card_public_id || '[]'); } catch { return []; }
	})();
	const legacySingle = !Array.isArray(oldPublicIds) && existing.id_card_public_id;
	const toDelete = legacySingle ? [existing.id_card_public_id] : oldPublicIds;
	for (const pid of toDelete) {
		if (pid) await cloudinary.uploader.destroy(pid, { resource_type: 'auto' }).catch(() => {});
	}

	const allBuffers = Array.isArray(buffers) ? buffers : [buffers];
	const uploads = await Promise.all(
		allBuffers.map((buf) => uploadDocumentToCloudinary(buf, 'borrowers'))
	);

	const urls = uploads.map((r) => r.secure_url);
	const publicIds = uploads.map((r) => r.public_id);

	console.log('[Cloudinary] uploadBorrowerDocument — uploaded', uploads.length, 'file(s)', urls);

	await borrowerRepo.updateBorrowerDocument(borrowerId, {
		id_card_url: JSON.stringify(urls),
		id_card_public_id: JSON.stringify(publicIds).slice(0, 100),
	});

	return { id_card_urls: urls };
};

module.exports = {
	updateItemImage,
	removeItemImage,
	uploadBorrowerDocument,
};
