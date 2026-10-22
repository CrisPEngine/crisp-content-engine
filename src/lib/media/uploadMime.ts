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

const REPORTED_HEIC_ALIASES: Record<string, string> = {
	'image/heic-sequence': 'image/heic',
	'image/heif-sequence': 'image/heif',
};

export function resolveUploadMimeType(filename: string, reportedMime: string): string | null {
	const normalized = (reportedMime || '').trim().toLowerCase();
	const aliased = REPORTED_HEIC_ALIASES[normalized] ?? normalized;
	if (UPLOAD_IMAGE_MIME_TYPES.includes(aliased as (typeof UPLOAD_IMAGE_MIME_TYPES)[number])) {
		return aliased === 'image/jpg' ? 'image/jpeg' : aliased;
	}
	const ext = extensionFromFilename(filename);
	const fromExt = ext ? EXTENSION_MIME[ext] : undefined;
	if (fromExt) return fromExt;
	if (!normalized || normalized === 'application/octet-stream') return null;
	return null;
}

export function isAllowedUploadMime(mime: string | null): mime is string {
	return Boolean(mime && UPLOAD_IMAGE_MIME_TYPES.includes(mime as (typeof UPLOAD_IMAGE_MIME_TYPES)[number]));
}
