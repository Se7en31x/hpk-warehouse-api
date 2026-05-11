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

const uploadBorrowerDocument = async (req, res) => {
	try {
		const { id } = req.params;
		const files = req.files || (req.file ? [req.file] : []);
		if (!files.length) {
			return util.sendResponse(res, 400, 'No document file provided');
		}
		const buffers = files.map((f) => f.buffer);
		const result = await fileService.uploadBorrowerDocument(id, buffers);
		return util.sendResponse(res, 200, 'Upload borrower document success', result);
	} catch (error) {
		return util.sendResponse(res, 500, error.message);
	}
};

// ── Return attachments ──────────────────────────────────────────────────────
const buildReturnUploader = (flow, phase) => async (req, res) => {
	try {
		const { id } = req.params;
		const files = req.files || (req.file ? [req.file] : []);
		if (!files.length) {
			return util.sendResponse(res, 400, 'No files provided');
		}
		const uploadedBy = req.user?.id || req.user?.sub || null;
		const result = await fileService.uploadReturnAttachments({
			flow,
			phase,
			recordId: Number(id),
			files,
			uploadedBy,
		});
		return util.sendResponse(res, 200, 'Upload return attachments success', result);
	} catch (error) {
		const status = /not found/i.test(error.message)
			? 404
			: /limit exceeded/i.test(error.message)
				? 400
				: 500;
		return util.sendResponse(res, status, error.message);
	}
};

const buildReturnAttachmentDeleter = (flow, phase) => async (req, res) => {
	try {
		const { id } = req.params;
		const publicId = req.body?.public_id || req.query?.public_id;
		if (!publicId) {
			return util.sendResponse(res, 400, 'public_id is required');
		}
		const result = await fileService.deleteReturnAttachment({
			flow,
			phase,
			recordId: Number(id),
			publicId,
		});
		return util.sendResponse(res, 200, 'Delete return attachment success', result);
	} catch (error) {
		const status = /not found/i.test(error.message) ? 404 : 500;
		return util.sendResponse(res, status, error.message);
	}
};

const uploadBorrowReturnSubmit = buildReturnUploader('borrow', 'submit');
const uploadBorrowReturnVerify = buildReturnUploader('borrow', 'verify');
const uploadDepartmentReturnSubmit = buildReturnUploader('department', 'submit');
const uploadDepartmentReturnProcess = buildReturnUploader('department', 'process');

const deleteBorrowReturnSubmit = buildReturnAttachmentDeleter('borrow', 'submit');
const deleteBorrowReturnVerify = buildReturnAttachmentDeleter('borrow', 'verify');
const deleteDepartmentReturnSubmit = buildReturnAttachmentDeleter('department', 'submit');
const deleteDepartmentReturnProcess = buildReturnAttachmentDeleter('department', 'process');

module.exports = {
	updateItemImage,
	removeItemImage,
	uploadBorrowerDocument,
	uploadBorrowReturnSubmit,
	uploadBorrowReturnVerify,
	uploadDepartmentReturnSubmit,
	uploadDepartmentReturnProcess,
	deleteBorrowReturnSubmit,
	deleteBorrowReturnVerify,
	deleteDepartmentReturnSubmit,
	deleteDepartmentReturnProcess,
};
