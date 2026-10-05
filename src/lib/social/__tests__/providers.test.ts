import { describe, expect, it } from 'vitest';
import { SOCIAL_PROVIDERS, DESTINATION_TYPES } from '@/lib/social/providers';

describe('social providers', () => {
	it('keeps legacy meta separate from instagram login', () => {
		expect(SOCIAL_PROVIDERS.META_LEGACY).toBe('meta');
		expect(SOCIAL_PROVIDERS.INSTAGRAM).toBe('instagram');
		expect(DESTINATION_TYPES.INSTAGRAM_PROFESSIONAL).toBe('instagram_professional');
		expect(DESTINATION_TYPES.INSTAGRAM_LINKED).toBe('instagram');
	});
});
