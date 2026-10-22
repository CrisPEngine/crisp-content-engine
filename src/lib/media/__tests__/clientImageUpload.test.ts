import { describe, expect, it } from 'vitest';
import {
	bufferLooksLikeHeic,
	isHeicOrHeifFile,
	jpegUploadFilename,
	needsUploadCompression,
	scaledDimensions,
	VERCEL_SAFE_UPLOAD_BYTES,
} from '../clientImageUpload';

describe('clientImageUpload helpers', () => {
	it('detects HEIC by extension when type is empty', () => {
		expect(isHeicOrHeifFile('IMG_0001.HEIC', '')).toBe(true);
		expect(isHeicOrHeifFile('photo.jpg', 'image/jpeg')).toBe(false);
	});

	it('scales dimensions to max edge', () => {
		expect(scaledDimensions(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 });
		expect(scaledDimensions(800, 600, 2048)).toEqual({ width: 800, height: 600 });
	});

	it('flags large files for compression', () => {
		expect(needsUploadCompression(VERCEL_SAFE_UPLOAD_BYTES + 1)).toBe(true);
		expect(needsUploadCompression(1024)).toBe(false);
	});

	it('builds jpeg filenames', () => {
		expect(jpegUploadFilename('IMG_1234.HEIC')).toBe('IMG_1234.jpg');
	});

	it('sniffs HEIC from ftyp header', () => {
		const sample = new Uint8Array(16);
		sample.set([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 0);
		expect(bufferLooksLikeHeic(sample)).toBe(true);
	});
});
