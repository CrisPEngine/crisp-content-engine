import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabaseService', () => ({
	getSupabaseService: vi.fn(),
}));

vi.mock('../persistence/applyGeneratedItems', () => ({
	markRunFailed: vi.fn(),
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

import { markRunFailed } from '../persistence/applyGeneratedItems';
import { markStaleGeneratingRunIfNeeded, STALE_GENERATING_ERROR } from '../persistence/staleRunGuard';

describe('markStaleGeneratingRunIfNeeded', () => {
	beforeEach(() => {
		vi.mocked(markRunFailed).mockReset();
	});

	it('does nothing for recent generating runs', async () => {
		const result = await markStaleGeneratingRunIfNeeded({
			id: 'run-1',
			status: 'generating',
			created_at: new Date().toISOString(),
		});
		expect(result).toBeNull();
		expect(markRunFailed).not.toHaveBeenCalled();
	});

	it('marks old generating runs as failed', async () => {
		const result = await markStaleGeneratingRunIfNeeded({
			id: 'run-1',
			status: 'generating',
			created_at: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
		});
		expect(result).toBe(STALE_GENERATING_ERROR);
		expect(markRunFailed).toHaveBeenCalledWith('run-1', STALE_GENERATING_ERROR);
	});

	it('uses generation_started_at for stale detection when present', async () => {
		const result = await markStaleGeneratingRunIfNeeded({
			id: 'run-2',
			status: 'generating',
			created_at: new Date().toISOString(),
			generation_started_at: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
		});
		expect(result).toBe(STALE_GENERATING_ERROR);
	});

	it('ignores completed runs', async () => {
		const result = await markStaleGeneratingRunIfNeeded({
			id: 'run-1',
			status: 'review',
			created_at: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
		});
		expect(result).toBeNull();
	});
});
