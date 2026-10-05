import { afterEach, describe, expect, it } from 'vitest';
import { nativeIntelligenceBlock, nativeIntelligenceBrandAllowlist } from '@/lib/featureFlags';

describe('native intelligence eligibility', () => {
	afterEach(() => {
		delete process.env.NATIVE_INTELLIGENCE_ENABLED;
		delete process.env.NATIVE_INTELLIGENCE_BRAND_ALLOWLIST;
	});

	it('defaults on when the environment variable is absent and ignores the old allowlist', () => {
		process.env.NATIVE_INTELLIGENCE_BRAND_ALLOWLIST = 'someone-else';
		expect(nativeIntelligenceBrandAllowlist()).toEqual(['someone-else']);
		expect(nativeIntelligenceBlock({ nativeIntelligenceEnabled: undefined })).toBeNull();
	});

	it('stops every brand when the global switch is false', () => {
		process.env.NATIVE_INTELLIGENCE_ENABLED = 'false';
		expect(nativeIntelligenceBlock({})).toBe('native_intelligence_globally_disabled');
	});

	it('stops one brand when that brand is explicitly disabled', () => {
		expect(nativeIntelligenceBlock({ nativeIntelligenceEnabled: false })).toBe('native_intelligence_brand_disabled');
		expect(nativeIntelligenceBlock({ nativeIntelligenceEnabled: true })).toBeNull();
	});
});
