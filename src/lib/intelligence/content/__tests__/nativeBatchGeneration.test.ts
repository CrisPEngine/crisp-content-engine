import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isLegacyMakeEnabled } from '@/lib/featureFlags';

describe('native content generation defaults', () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	it('does not enable legacy Make unless explicitly flagged', () => {
		expect(isLegacyMakeEnabled()).toBe(false);
		vi.stubEnv('LEGACY_MAKE_ENABLED', 'true');
		expect(isLegacyMakeEnabled()).toBe(true);
	});

	it('content generate route branches on legacy flag', async () => {
		const src = await import('fs/promises').then((fs) =>
			fs.readFile(`${process.cwd()}/src/app/api/content/generate/route.ts`, 'utf8'),
		);
		expect(src).toContain('isLegacyMakeEnabled');
		expect(src).toContain('createNativeGenerationJob');
		expect(src).toContain('engine: \'native\'');
	});
});
