import { describe, expect, it } from 'vitest';
import { coerceBoolean } from '../coerceBoolean';
import {
	companyOnboardingFixture,
	normalizeOnboardingBody,
	onboardingApiSchema,
} from '../onboardingApiSchema';

describe('coerceBoolean', () => {
	it('coerces common string forms', () => {
		expect(coerceBoolean('true')).toBe(true);
		expect(coerceBoolean('false')).toBe(false);
		expect(coerceBoolean('yes')).toBe(true);
		expect(coerceBoolean('no')).toBe(false);
		expect(coerceBoolean('')).toBe(true);
		expect(coerceBoolean(undefined, false)).toBe(false);
	});
});

describe('onboardingApiSchema', () => {
	it('accepts a valid company onboarding payload', () => {
		const parsed = onboardingApiSchema.parse(companyOnboardingFixture());
		expect(parsed.client_name).toBe('PremiumDieCast');
		expect(parsed.platforms_requested).toEqual(['Instagram', 'Facebook']);
		expect(parsed.brand_assets_urls).toHaveLength(1);
	});

	it('coerces avoid_negative_tones when sent as a string', () => {
		const parsed = onboardingApiSchema.parse(
			companyOnboardingFixture({ avoid_negative_tones: 'false' }),
		);
		expect(parsed.avoid_negative_tones).toBe(false);
	});

	it('normalizes platforms_requested from a single string', () => {
		const body = normalizeOnboardingBody(
			companyOnboardingFixture({ platforms_requested: 'LinkedIn' }),
		);
		const parsed = onboardingApiSchema.parse(body);
		expect(parsed.platforms_requested).toEqual(['LinkedIn']);
	});

	it('rejects company save when no platforms are selected', () => {
		const result = onboardingApiSchema.safeParse(
			companyOnboardingFixture({ platforms_requested: [] }),
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			const platformIssue = result.error.issues.find((issue) =>
				issue.path.includes('platforms_requested'),
			);
			expect(platformIssue).toBeDefined();
		}
	});

	it('treats empty avoid_negative_tones as true after normalization', () => {
		const body = normalizeOnboardingBody(
			companyOnboardingFixture({ avoid_negative_tones: '' }),
		);
		const parsed = onboardingApiSchema.parse(body);
		expect(parsed.avoid_negative_tones).toBe(true);
	});
});
