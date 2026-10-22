import { describe, expect, it } from 'vitest';
import { isAllowedUploadMime, resolveUploadMimeType } from '../uploadMime';

describe('uploadMime', () => {
	it('accepts HEIC by extension when browser sends octet-stream', () => {
		const mime = resolveUploadMimeType('IMG_1234.HEIC', 'application/octet-stream');
		expect(mime).toBe('image/heic');
		expect(isAllowedUploadMime(mime)).toBe(true);
	});

	it('accepts HEIF by extension', () => {
		expect(resolveUploadMimeType('photo.heif', '')).toBe('image/heif');
	});

	it('rejects unknown extensions', () => {
		expect(resolveUploadMimeType('file.gif', 'image/gif')).toBeNull();
	});

	it('prefers HEIC extension when browser sends a wrong MIME type', () => {
		expect(resolveUploadMimeType('IMG_1234.heic', 'application/pdf')).toBe('image/heic');
	});

	it('accepts HEIC sequence MIME aliases', () => {
		expect(resolveUploadMimeType('photo.heic', 'image/heic-sequence')).toBe('image/heic');
	});
});
