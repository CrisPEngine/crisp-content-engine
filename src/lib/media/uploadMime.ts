export const UPLOAD_IMAGE_MIME_TYPES = [
	'image/jpeg',
	'image/jpg',
	'image/png',
	'image/webp',
	'image/heic',
	'image/heif',
] as const;

export const UPLOAD_IMAGE_FRIENDLY_LABEL =
	'JPEG, PNG, WebP, HEIC, and HEIF (iPhone photos are converted to JPG after upload)';

const EXTENSION_MIME: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	heic: 'image/heic',
	heif: 'image/heif',
};

export function extensionFromFilename(filename: string): string | undefined {
	const parts = filename.trim().toLowerCase().split('.');
	if (parts.length < 2) return undefined;
	return parts[parts.length - 1];
}

export function resolveUploadMimeType(filename: string, reportedMime: string): string | null {
	const normalized = (reportedMime || '').trim().toLowerCase();
	if (UPLOAD_IMAGE_MIME_TYPES.includes(normalized as (typeof UPLOAD_IMAGE_MIME_TYPES)[number])) {
		return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
	}
	if (normalized && normalized !== 'application/octet-stream') return null;
	const ext = extensionFromFilename(filename);
	if (!ext) return null;
	return EXTENSION_MIME[ext] ?? null;
}

export function isAllowedUploadMime(mime: string | null): mime is string {
	return Boolean(mime && UPLOAD_IMAGE_MIME_TYPES.includes(mime as (typeof UPLOAD_IMAGE_MIME_TYPES)[number]));
}
