const multer = require('multer');
const { Readable } = require('stream');
const cloudinary = require('../config/cloudinary');

// ── Image-only uploader (items) ───────────────────────────────────────────────
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
	fileFilter: (_req, file, cb) => {
		if (file.mimetype.startsWith('image/')) {
			cb(null, true);
		} else {
			cb(new Error('Only image files are allowed'));
		}
	},
});

// ── Document uploader (borrower ID-card: images + PDF) ───────────────────────
const ALLOWED_DOCUMENT_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/heic',
	'image/heif',
	'application/pdf',
]);

const uploadDocument = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
	fileFilter: (_req, file, cb) => {
		if (ALLOWED_DOCUMENT_TYPES.has(file.mimetype)) {
			cb(null, true);
		} else {
			cb(new Error('Only images (JPEG, PNG, WEBP, HEIC/HEIF) or PDF files are allowed'));
		}
	},
});

// ── Cloudinary helpers ────────────────────────────────────────────────────────

/** Upload an image to Cloudinary with resize transformation (for item photos). */
const uploadToCloudinary = (buffer, folder = 'items') => {
	return new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				folder,
				resource_type: 'image',
				transformation: [{ width: 500, height: 500, crop: 'limit' }],
			},
			(error, result) => {
				if (error) return reject(error);
				resolve(result);
			}
		);
		Readable.from(buffer).pipe(stream);
	});
};

/**
 * Upload a document (image or PDF) to Cloudinary.
 * Uses resource_type: "auto" so Cloudinary handles both image and raw/PDF types.
 * No resizing — documents are stored as-is.
 */
const uploadDocumentToCloudinary = (buffer, folder = 'borrowers') => {
	return new Promise((resolve, reject) => {
		const stream = cloudinary.uploader.upload_stream(
			{
				folder,
				resource_type: 'auto',
			},
			(error, result) => {
				if (error) return reject(error);
				resolve(result);
			}
		);
		Readable.from(buffer).pipe(stream);
	});
};

module.exports = { upload, uploadDocument, uploadToCloudinary, uploadDocumentToCloudinary };
