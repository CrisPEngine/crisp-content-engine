import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabaseService', () => ({
	getSupabaseService: vi.fn(() => ({
		from: vi.fn(() => ({
			select: vi.fn(() => ({
				eq: vi.fn(() => ({
					single: vi.fn().mockResolvedValue({
						data: {
							id: 'run-1',
							series_run_id: 'series-1',
							user_id: 'user-1',
							brand_profile_id: 'recBrand',
							idea: 'Test idea with enough chars',
							goal: 'Engagement',
							notes: null,
							selected_channels: ['LinkedIn'],
							publish_mode: 'queue_only',
						},
						error: null,
					}),
				})),
			})),
		})),
	})),
}));

vi.mock('@/lib/planResolver', () => ({
	resolvePlan: vi.fn().mockResolvedValue({ plan: 'growth' }),
}));

vi.mock('@/lib/enforceCaps', () => ({
	getChannelUsage: vi.fn().mockResolvedValue({
		linkedin: 0,
		x: 0,
		blog: 0,
		meta_pool: 0,
	}),
}));

vi.mock('../data/loadBrandProfile', () => ({
	loadBrandProfile: vi.fn().mockResolvedValue({ client_name: 'Test Brand', timezone: 'UTC' }),
	extractTimezoneAndWindows: vi.fn().mockReturnValue({ timezone: 'UTC', postingWindows: null }),
}));

vi.mock('../data/loadContentHistory', () => ({
	loadContentHistory: vi.fn(),
}));

import { loadContentHistory } from '../data/loadContentHistory';
import { IDEA_ENGINE_HISTORY_WARNING } from '../airtable/contentQueueQuery';
import { loadRunContextFromDb } from '../data/loadRunContext';

describe('loadRunContextFromDb', () => {
	beforeEach(() => {
		vi.mocked(loadContentHistory).mockReset();
	});

	it('continues generation context when content history fails', async () => {
		vi.mocked(loadContentHistory).mockResolvedValueOnce({
			entries: [],
			warning: IDEA_ENGINE_HISTORY_WARNING,
		});

		const { context } = await loadRunContextFromDb('run-1');

		expect(context.previousContentJson).toEqual([]);
		expect(context.historyWarning).toBe(IDEA_ENGINE_HISTORY_WARNING);
		expect(context.requestedCounts.LinkedIn).toBeGreaterThan(0);
	});
});
