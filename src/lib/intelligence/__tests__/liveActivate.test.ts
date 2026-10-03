import { readFileSync } from 'fs';
import { beforeAll, describe, expect, it } from 'vitest';

function loadEnvLocal(): void {
	try {
		const text = readFileSync('.env.local', 'utf8');
		for (const line of text.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
			const index = trimmed.indexOf('=');
			const key = trimmed.slice(0, index);
			let value = trimmed.slice(index + 1);
			if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
				value = value.slice(1, -1);
			}
			if (!process.env[key]) process.env[key] = value;
		}
	} catch {
		/* optional */
	}
}

const live = process.env.CCE_LIVE_ACTIVATE === '1';
const probeOnly = process.env.CCE_PROBE_ONLY === '1';

const diagnostic = process.env.CCE_IDEA_ENGINE_DIAGNOSTIC === '1';

describe.skipIf(!diagnostic)('Idea Engine diagnostic lifecycle', () => {
	beforeAll(() => {
		loadEnvLocal();
	});

	it('ends failed with a persisted error instead of staying generating', async () => {
		const { runIdeaEngineDiagnostic } = await import('../live/activateFolian');
		const { getSupabaseService } = await import('@/lib/supabaseService');
		const admin = getSupabaseService();
		const { data: prior } = await admin
			.from('idea_engine_runs')
			.select('user_id, brand_profile_id')
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle();
		if (!prior?.user_id || !prior.brand_profile_id) {
			throw new Error('No prior idea engine run to copy a user and brand from');
		}
		const result = await runIdeaEngineDiagnostic(prior.user_id, prior.brand_profile_id);
		console.info('[Idea Engine diagnostic]', JSON.stringify(result));
		expect(result.status).not.toBe('generating');
		expect(['review', 'review_with_errors', 'failed']).toContain(result.status);
		if (result.status === 'failed') {
			expect(result.error).toBeTruthy();
			expect(result.error).not.toBe('Content generation failed. Please try again.');
		}
	}, 120_000);
});

describe.skipIf(!probeOnly)('configured model probe', () => {
	beforeAll(() => {
		loadEnvLocal();
	});

	it('records every role without falling back', async () => {
		const { probeConfiguredModels } = await import('../live/activateFolian');
		const { writeFileSync } = await import('fs');
		const probes = await probeConfiguredModels();
		writeFileSync('/tmp/folian-model-probes.json', JSON.stringify(probes, null, 2));
		expect(probes.length).toBe(2);
		expect(probes.some((probe) => probe.requestedModel === 'gpt-6-astra')).toBe(false);
		expect(probes.every((probe) => probe.fallbackUsed === false)).toBe(true);
	}, 180_000);
});

describe.skipIf(!live)('Folian native activation', () => {
	beforeAll(() => {
		loadEnvLocal();
	});

	it('generates a LinkedIn draft and parks it in ContentQueue without publishing', async () => {
		const { activateFolianNativeJourney } = await import('../live/activateFolian');
		const report = await activateFolianNativeJourney({ skipIdeaEngineDiagnostic: true });
		expect(report.queueReadback).toMatchObject({
			platform: 'LinkedIn',
			status: 'Needs Approval',
			hasBody: true,
			hasBrand: true,
		});
		expect(report.publisherWouldPublishNow).toBe(false);
		expect(report.publisherWouldSelect).toBe(false);
		expect(report.approvalQueryMatched).toBe(true);
		expect(report.publisherFieldShapeReady).toBe(true);
		expect(report.queueIdempotentRetry).toBe(true);
		const { writeFileSync } = await import('fs');
		writeFileSync('/tmp/folian-acceptance-report.json', JSON.stringify(report, null, 2));
	}, 600_000);
});
