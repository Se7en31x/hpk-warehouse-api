const itemRepo = require('../repositories/item.repo');
const borrowerRepo = require('../repositories/requisition.repo');
const requisitionRepo = require('../repositories/requisition.repo');
const reusableRepo = require('../repositories/reusableItem.repo');
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

// ── Return attachment helpers ────────────────────────────────────────────────
/** Parse JSONB value to attachment array (handles legacy string format too). */
const parseAttachments = (raw) => {
	if (!raw) return [];
	if (Array.isArray(raw)) return raw;
	try {
		const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
};

/**
 * Multer reads originalname as latin-1 by default, mangling UTF-8 (Thai) filenames.
 * Detect and re-decode if it looks like latin-1-encoded UTF-8.
 */
const decodeOriginalName = (raw) => {
	if (!raw) return null;
	try {
		// Round-trip through latin1 → utf8. If result has Thai/non-ASCII chars
		// and the buffer-decode is a valid string, prefer the decoded form.
		const decoded = Buffer.from(raw, 'latin1').toString('utf8');
		// Heuristic: if original contains high-bit chars (0x80-0xFF), it's likely mojibake
		if (/[\u0080-\u00FF]/.test(raw)) return decoded;
		return raw;
	} catch {
		return raw;
	}
};

const buildAttachmentMeta = (uploadResult, originalName, uploadedBy) => ({
	url: uploadResult.secure_url,
	public_id: uploadResult.public_id,
	resource_type: uploadResult.resource_type || 'auto',
	format: uploadResult.format || null,
	bytes: uploadResult.bytes || null,
	filename: decodeOriginalName(originalName),
	uploaded_by: uploadedBy || null,
	uploaded_at: new Date().toISOString(),
});

const MAX_RETURN_ATTACHMENTS = 10;

/**
 * Upload return attachments — APPENDS to existing array.
 * @param {object} opts
 * @param {'borrow'|'department'} opts.flow
 * @param {'submit'|'verify'|'process'} opts.phase
 * @param {number} opts.recordId
 * @param {{buffer: Buffer, originalname?: string}[]} opts.files
 * @param {string|null} opts.uploadedBy
 */
const uploadReturnAttachments = async ({ flow, phase, recordId, files = [], uploadedBy = null }) => {
	if (!recordId) throw new Error('recordId is required');
	if (!Array.isArray(files) || files.length === 0) throw new Error('No files provided');

	let fieldName;
	let folder;
	let getExisting;
	let updateExisting;

	if (flow === 'borrow') {
		fieldName = phase === 'verify' ? 'return_verify_attachments' : 'return_submit_attachments';
		folder = `returns/borrow/${recordId}/${phase}`;
		getExisting = () => requisitionRepo.getRequisitionAttachments(recordId, fieldName);
		updateExisting = (data) => requisitionRepo.updateRequisitionAttachments(recordId, fieldName, data);
	} else if (flow === 'department') {
		fieldName = phase === 'process' ? 'process_attachments' : 'submit_attachments';
		folder = `returns/department/${recordId}/${phase}`;
		getExisting = () => reusableRepo.getReturnRequestAttachments(recordId, fieldName);
		updateExisting = (data) => reusableRepo.updateReturnRequestAttachments(recordId, fieldName, data);
	} else {
		throw new Error(`Unknown return flow: ${flow}`);
	}

	const existing = await getExisting();
	if (!existing) throw new Error('Return record not found');

	const currentList = parseAttachments(existing[fieldName]);
	if (currentList.length + files.length > MAX_RETURN_ATTACHMENTS) {
		throw new Error(`Attachment limit exceeded (max ${MAX_RETURN_ATTACHMENTS} files per phase)`);
	}

	const uploads = await Promise.all(
		files.map((f) => uploadDocumentToCloudinary(f.buffer, folder).then((r) => ({ result: r, file: f })))
	);

	const newItems = uploads.map(({ result, file }) =>
		buildAttachmentMeta(result, file.originalname, uploadedBy)
	);

	const merged = [...currentList, ...newItems];
	await updateExisting(merged);

	return { attachments: merged, added: newItems };
};

/**
 * Delete a single return attachment by public_id.
 */
const deleteReturnAttachment = async ({ flow, phase, recordId, publicId }) => {
	if (!publicId) throw new Error('publicId is required');

	let fieldName;
	let getExisting;
	let updateExisting;

	if (flow === 'borrow') {
		fieldName = phase === 'verify' ? 'return_verify_attachments' : 'return_submit_attachments';
		getExisting = () => requisitionRepo.getRequisitionAttachments(recordId, fieldName);
		updateExisting = (data) => requisitionRepo.updateRequisitionAttachments(recordId, fieldName, data);
	} else if (flow === 'department') {
		fieldName = phase === 'process' ? 'process_attachments' : 'submit_attachments';
		getExisting = () => reusableRepo.getReturnRequestAttachments(recordId, fieldName);
		updateExisting = (data) => reusableRepo.updateReturnRequestAttachments(recordId, fieldName, data);
	} else {
		throw new Error(`Unknown return flow: ${flow}`);
	}

	const existing = await getExisting();
	if (!existing) throw new Error('Return record not found');

	const list = parseAttachments(existing[fieldName]);
	const target = list.find((item) => item && item.public_id === publicId);
	if (!target) throw new Error('Attachment not found');

	const filtered = list.filter((item) => item && item.public_id !== publicId);
	await updateExisting(filtered);

	// Best-effort destroy on Cloudinary (don't block on failure)
	await cloudinary.uploader
		.destroy(publicId, { resource_type: target.resource_type || 'auto' })
		.catch(() => {});

	return { attachments: filtered, removed: target };
};

module.exports = {
	updateItemImage,
	removeItemImage,
	uploadBorrowerDocument,
	uploadReturnAttachments,
	deleteReturnAttachment,
};
