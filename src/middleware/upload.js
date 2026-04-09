const multer = require('multer');
const { Readable } = require('stream');
const cloudinary = require('../config/cloudinary');

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
	fileFilter: (_req, file, cb) => {
		if (file.mimetype.startsWith('image/')) {
			cb(null, true);
		} else {
			cb(new Error('Only image files are allowed'));
		}
	},
});

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

module.exports = { upload, uploadToCloudinary };
