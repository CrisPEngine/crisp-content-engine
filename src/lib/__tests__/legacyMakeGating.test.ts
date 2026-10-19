import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isLegacyMakeEnabled } from '@/lib/featureFlags';

const root = path.resolve(__dirname, '../../..');

function read(rel: string): string {
	return readFileSync(path.join(root, rel), 'utf8');
}

describe('legacy Make gating on default user flows', () => {
	it('defaults LEGACY_MAKE_ENABLED to off', () => {
		expect(isLegacyMakeEnabled()).toBe(false);
	});

	it('gates content brief monthly path behind legacy flag', () => {
		const brief = read('src/app/api/content-brief/route.ts');
		expect(brief).toContain('isLegacyMakeEnabled');
		expect(brief).toContain('MAKE_STRATEGY_WEBHOOK_URL');
		const lib = read('src/lib/contentBrief.ts');
		expect(lib).toContain('triggerNativeContentFromBrief');
	});

	it('gates monthly strategy update behind native flow', () => {
		const monthly = read('src/app/api/strategy/monthly-update/route.ts');
		expect(monthly).toContain('isLegacyMakeEnabled');
		expect(monthly).toContain('enqueueMonthlyNativeStrategy');
	});

	it('uses native batch generation before Make in content generate', () => {
		const src = read('src/app/api/content/generate/route.ts');
		const nativeIdx = src.indexOf('createNativeGenerationJob');
		const legacyIdx = src.indexOf('MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL');
		expect(nativeIdx).toBeGreaterThan(-1);
		expect(legacyIdx).toBeGreaterThan(nativeIdx);
		expect(src).toContain('if (!isLegacyMakeEnabled())');
	});
});
