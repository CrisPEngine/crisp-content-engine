import { describe, expect, it } from 'vitest';
import { isPlaceholderAltText, resolveAssetAltText } from '@/lib/media/altText';
import { channelSupportsExplicitImage } from '@/lib/media/explicitImage';
import { mediaSpecFor } from '@/lib/media/channelMedia';
import { planMedia } from '@/lib/media/planner';

describe('Threads media capabilities', () => {
	it('maps legacy threads channel to platform-supported optional images', () => {
		const spec = mediaSpecFor('threads');
		expect(spec.mediaRequired).toBe(false);
		expect(spec.textOnlySupported).toBe(true);
		expect(spec.supportedTypes).toContain('IMAGE');
		expect(spec.implementation).toBe('SUPPORTED_BY_PLATFORM');
		expect(channelSupportsExplicitImage('threads')).toBe(true);
		expect(channelSupportsExplicitImage('THREADS')).toBe(true);
	});

	it('defaults text-only for argument posts but allows explicit image generation', () => {
		const decision = planMedia({
			channel: 'threads',
			topic: 'Why autocomplete fails a novel',
		});
		expect(decision.mediaRecommended).toBe(false);
		expect(decision.reason).toMatch(/text-only/i);
		expect(channelSupportsExplicitImage('threads')).toBe(true);
	});

	it('does not allow explicit image override on channels without a connected publisher', () => {
		expect(channelSupportsExplicitImage('X')).toBe(false);
	});
});

describe('asset alt text', () => {
	it('treats planner placeholder directions as missing alt text', () => {
		expect(isPlaceholderAltText('State what the visual shows.')).toBe(true);
		expect(
			resolveAssetAltText({
				altTextDirection: 'State what the visual shows.',
				topic: 'Canon and continuity',
			}),
		).toBe('Visual supporting: Canon and continuity.');
	});
});
