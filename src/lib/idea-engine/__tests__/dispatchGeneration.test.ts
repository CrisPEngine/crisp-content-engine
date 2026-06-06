import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
	after: vi.fn((fn: () => void) => fn()),
}));

vi.mock('@/lib/supabaseService', () => ({
	getSupabaseService: vi.fn(() => ({
		from: vi.fn(() => ({
			update: vi.fn(() => ({
				eq: vi.fn().mockResolvedValue({ error: null }),
			})),
		})),
	})),
}));

vi.mock('../generator/generateSeries', () => ({
	generateChannelsForRun: vi.fn().mockResolvedValue(undefined),
}));

import { after } from 'next/server';
import { generateChannelsForRun } from '../generator/generateSeries';
import {
	dispatchGenerationJob,
	resolveIdeaEngineAppBaseUrl,
	resolveIdeaEngineExecuteSecret,
} from '../dispatchGeneration';

describe('dispatchGenerationJob', () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		vi.clearAllMocks();
		process.env.CRON_SECRET = 'test-secret';
		process.env.NEXT_PUBLIC_SITE_URL = 'https://app.example.com';
	});

	afterEach(() => {
		global.fetch = originalFetch;
		delete process.env.CRON_SECRET;
		delete process.env.IDEA_ENGINE_EXECUTE_SECRET;
		delete process.env.NEXT_PUBLIC_SITE_URL;
	});

	it('resolves execute secret from CRON_SECRET fallback', () => {
		expect(resolveIdeaEngineExecuteSecret()).toBe('test-secret');
	});

	it('dispatches to execute route when secret is configured', async () => {
		global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

		await dispatchGenerationJob({ runId: 'run-abc' });

		expect(global.fetch).toHaveBeenCalledWith(
			'https://app.example.com/api/idea-engine/run/run-abc/execute',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					'x-idea-engine-execute-secret': 'test-secret',
				}),
			}),
		);
		expect(after).not.toHaveBeenCalled();
	});

	it('falls back to after() when execute dispatch fails', async () => {
		global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'error' });

		await dispatchGenerationJob({ runId: 'run-fallback' });

		expect(after).toHaveBeenCalled();
		expect(generateChannelsForRun).toHaveBeenCalledWith('run-fallback', undefined);
	});

	it('uses after() when no secret is configured', async () => {
		delete process.env.CRON_SECRET;
		global.fetch = vi.fn();

		await dispatchGenerationJob({ runId: 'run-local' });

		expect(global.fetch).not.toHaveBeenCalled();
		expect(after).toHaveBeenCalled();
	});

	it('resolveIdeaEngineAppBaseUrl prefers NEXT_PUBLIC_SITE_URL', () => {
		expect(resolveIdeaEngineAppBaseUrl()).toBe('https://app.example.com');
	});
});
