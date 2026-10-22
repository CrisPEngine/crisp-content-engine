import { extensionFromFilename, isAllowedUploadMime, resolveUploadMimeType } from '@/lib/media/uploadMime';

/** Stay under Vercel's ~4.5 MB request body limit (multipart overhead included). */
export const VERCEL_SAFE_UPLOAD_BYTES = 3.5 * 1024 * 1024;

export const MAX_UPLOAD_EDGE_PX = 2048;

export function scaledDimensions(
	width: number,
	height: number,
	maxEdge: number,
): { width: number; height: number } {
	if (width <= 0 || height <= 0) return { width: maxEdge, height: maxEdge };
	const scale = Math.min(1, maxEdge / Math.max(width, height));
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

export function needsUploadCompression(sizeBytes: number): boolean {
	return sizeBytes > VERCEL_SAFE_UPLOAD_BYTES;
}

export function isHeicOrHeifFile(filename: string, reportedMime: string): boolean {
	const mime = resolveUploadMimeType(filename, reportedMime);
	return mime === 'image/heic' || mime === 'image/heif';
}

const HEIC_FTYP_BRANDS = new Set(['heic', 'heix', 'hevc', 'heif', 'mif1', 'msf1']);

/** Detect HEIC/HEIF from ISO-BMFF header when Safari reports JPEG or leaves type empty. */
export function bufferLooksLikeHeic(bytes: Uint8Array): boolean {
	if (bytes.length < 12) return false;
	const box = String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!);
	if (box !== 'ftyp') return false;
	const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
	return HEIC_FTYP_BRANDS.has(brand);
}

export async function fileLooksLikeHeic(file: File): Promise<boolean> {
	if (isHeicOrHeifFile(file.name, file.type)) return true;
	const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
	return bufferLooksLikeHeic(head);
}

export function jpegUploadFilename(originalName: string): string {
	const base = originalName.replace(/\.[^.]+$/, '') || 'upload';
	return `${base}.jpg`;
}

async function heicToJpegBlob(file: File): Promise<Blob> {
	const heic2any = (await import('heic2any')).default;
	const converted = await heic2any({
		blob: file,
		toType: 'image/jpeg',
		quality: 0.92,
	});
	const blob = Array.isArray(converted) ? converted[0] : converted;
	if (!(blob instanceof Blob)) {
		throw new Error('HEIC conversion did not produce an image.');
	}
	return blob;
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Could not read this image in the browser.'));
		};
		img.src = url;
	});
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) reject(new Error('Could not compress this image.'));
				else resolve(blob);
			},
			'image/jpeg',
			quality,
		);
	});
}

async function compressBlobToUploadLimit(source: Blob, filename: string): Promise<File> {
	const img = await loadImageFromBlob(source);
	let { width, height } = scaledDimensions(img.naturalWidth, img.naturalHeight, MAX_UPLOAD_EDGE_PX);
	let best: Blob | null = null;

	for (let attempt = 0; attempt < 8; attempt += 1) {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Could not prepare image compression.');
		ctx.drawImage(img, 0, 0, width, height);

		for (const quality of [0.88, 0.8, 0.72, 0.64, 0.56]) {
			const blob = await canvasToJpegBlob(canvas, quality);
			best = blob;
			if (blob.size <= VERCEL_SAFE_UPLOAD_BYTES) {
				return new File([blob], jpegUploadFilename(filename), { type: 'image/jpeg', lastModified: Date.now() });
			}
		}

		width = Math.max(1, Math.round(width * 0.75));
		height = Math.max(1, Math.round(height * 0.75));
	}

	if (!best) throw new Error('Could not compress this image enough to upload.');
	return new File([best], jpegUploadFilename(filename), { type: 'image/jpeg', lastModified: Date.now() });
}

export type PrepareImageUploadResult = {
	file: File;
	detail?: string;
};

/**
 * Convert HEIC/HEIF to JPEG and compress large photos in the browser so uploads stay under server limits.
 */
export async function prepareImageFileForUpload(file: File): Promise<PrepareImageUploadResult> {
	const resolved = resolveUploadMimeType(file.name, file.type);
	if (!isAllowedUploadMime(resolved)) {
		throw new Error(
			`Unsupported image type for ${file.name}. Use JPEG, PNG, WebP, or iPhone HEIC/HEIF photos.`,
		);
	}

	const notes: string[] = [];
	let working: File = file;

	if (await fileLooksLikeHeic(file)) {
		try {
			const jpegBlob = await heicToJpegBlob(file);
			working = new File([jpegBlob], jpegUploadFilename(file.name), {
				type: 'image/jpeg',
				lastModified: Date.now(),
			});
			notes.push('Converted HEIC/HEIF to JPEG');
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : 'HEIC conversion failed';
			throw new Error(`Could not convert ${file.name} from HEIC/HEIF: ${message}`);
		}
	}

	if (needsUploadCompression(working.size)) {
		working = await compressBlobToUploadLimit(working, working.name);
		notes.push('Compressed for upload');
	} else if (working.type !== 'image/jpeg' && working.type !== 'image/png' && working.type !== 'image/webp') {
		// Normalise odd types after conversion
		if (working.type === 'image/jpg') {
			working = new File([working], working.name, { type: 'image/jpeg', lastModified: working.lastModified });
		}
	}

	const ext = extensionFromFilename(working.name);
	if (ext && !['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
		working = new File([working], jpegUploadFilename(working.name), {
			type: 'image/jpeg',
			lastModified: working.lastModified,
		});
	}

	return {
		file: working,
		detail: notes.length ? notes.join('. ') : undefined,
	};
}
