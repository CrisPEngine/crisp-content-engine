import { describe, expect, it } from 'vitest';
import { mapOnboardingToNative } from '../mapOnboardingToNative';

describe('mapOnboardingToNative', () => {
	it('maps company onboarding fields into native brain and draft strategy', () => {
		const mapped = mapOnboardingToNative({
			brandType: 'company',
			clientName: 'PremiumDieCast.com',
			website: 'https://premiumdiecast.com',
			audience: 'Collectors and hobbyists who buy diecast models online.',
			valueProps: 'Curated inventory, fast shipping, and rare models.',
			offers: 'Diecast cars, trucks, and display cases.',
			brandGoals: 'Grow ecommerce sales and community engagement.',
			platformsRequested: ['Instagram', 'Facebook'],
			timezone: 'America/New_York',
			languageRegion: 'US English',
			preferredImageSource: 'Brand',
		});

		expect(mapped.identity.name).toBe('PremiumDieCast.com');
		expect(mapped.strategy.status).toBe('draft');
		expect(mapped.strategy.contentMix.instagram).toBe('requested');
		expect(mapped.strategy.contentMix.facebook).toBe('requested');
	});
});
