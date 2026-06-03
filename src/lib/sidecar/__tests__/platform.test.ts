import { describe, expect, it } from 'vitest';
import { detectPlatformFromHostname, detectPlatformFromUrl } from '../platform';

describe('detectPlatformFromUrl', () => {
	it('detects LinkedIn', () => {
		expect(detectPlatformFromUrl('https://www.linkedin.com/feed/')).toBe('linkedin');
	});

	it('detects X', () => {
		expect(detectPlatformFromUrl('https://x.com/user/status/1')).toBe('x');
	});

	it('defaults to web', () => {
		expect(detectPlatformFromUrl('https://example.com')).toBe('web');
	});
});

describe('detectPlatformFromHostname', () => {
	it('detects reddit', () => {
		expect(detectPlatformFromHostname('old.reddit.com')).toBe('reddit');
	});
});
