import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
	api_key: process.env.CLOUDINARY_API_KEY,
	api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface CloudinaryUploadResult {
	secure_url: string;
	public_id: string;
	width: number;
	height: number;
}

export function uploadImageFromBuffer(
	buffer: Buffer,
	filename: string
): Promise<CloudinaryUploadResult> {
	return new Promise((resolve, reject) => {
		cloudinary.uploader
			.upload_stream(
				{
					folder: process.env.CLOUDINARY_FOLDER ?? 'crisp-content-engine/uploads',
					resource_type: 'image',
					format: 'jpg',
					transformation: [
						{ width: 1920, height: 1920, crop: 'limit' },
						{ quality: 'auto', fetch_format: 'auto' },
					],
				},
				(error, result) => {
					if (error) return reject(error);
					if (!result) {
						return reject(new Error('Upload failed: No result from Cloudinary'));
					}
					resolve({
						secure_url: result.secure_url,
						public_id: result.public_id,
						width: result.width || 0,
						height: result.height || 0,
					});
				}
			)
			.end(buffer);
	});
}

