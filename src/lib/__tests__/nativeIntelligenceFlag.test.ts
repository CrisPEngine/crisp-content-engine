import { afterEach, describe, expect, it } from 'vitest';
import { isNativeIntelligenceEnabledForBrand } from '@/lib/featureFlags';

describe('native intelligence brand allowlist', () => {
	afterEach(() => {
		delete process.env.NATIVE_INTELLIGENCE_ENABLED;
		delete process.env.NATIVE_INTELLIGENCE_BRAND_ALLOWLIST;
	});

	const folianCanonicalId = '03cba45a-6faf-4b6c-a20b-2c2496318b58';

	it('leaves every brand on Make when the pilot is unset', () => {
		expect(isNativeIntelligenceEnabledForBrand(folianCanonicalId)).toBe(false);
		expect(isNativeIntelligenceEnabledForBrand('recampvDrWLSi3FrA')).toBe(false);
	});

	it('enables only the listed canonical brand id', () => {
		process.env.NATIVE_INTELLIGENCE_ENABLED = 'true';
		process.env.NATIVE_INTELLIGENCE_BRAND_ALLOWLIST = folianCanonicalId;
		expect(isNativeIntelligenceEnabledForBrand(folianCanonicalId)).toBe(true);
		expect(isNativeIntelligenceEnabledForBrand('recampvDrWLSi3FrA')).toBe(false);
		expect(isNativeIntelligenceEnabledForBrand('11111111-1111-4111-8111-111111111111')).toBe(false);
	});

	it('enables nobody when the flag is on and the list is empty', () => {
		process.env.NATIVE_INTELLIGENCE_ENABLED = 'true';
		expect(isNativeIntelligenceEnabledForBrand(folianCanonicalId)).toBe(false);
	});
});
