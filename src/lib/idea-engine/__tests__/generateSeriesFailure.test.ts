import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabaseService', () => ({
	getSupabaseService: vi.fn(),
}));

vi.mock('../data/loadRunContext', () => ({
	loadRunContextFromDb: vi.fn(),
}));

vi.mock('../generator/completeWithValidationRepair', () => ({
	completeIdeaEngineItemsWithRepair: vi.fn(),
}));

vi.mock('../persistence/applyGeneratedItems', () => ({
	applyGeneratedItems: vi.fn().mockResolvedValue({ applied: 0 }),
	finalizeRunAfterGeneration: vi.fn(),
	markChannelItemsFailed: vi.fn(),
	markRunFailed: vi.fn(),
}));

import { getSupabaseService } from '@/lib/supabaseService';
import { loadRunContextFromDb } from '../data/loadRunContext';
import { completeIdeaEngineItemsWithRepair } from '../generator/completeWithValidationRepair';
import {
	finalizeRunAfterGeneration,
	markChannelItemsFailed,
} from '../persistence/applyGeneratedItems';
import { LlmError } from '@/lib/llm';
import { generateSeries } from '../generator/generateSeries';

function mockSupabaseChain(rows: Array<{ status: string }>) {
	const chain = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data: rows[0] }),
	};
	let call = 0;
	chain.single.mockImplementation(() => {
		const row = rows[Math.min(call, rows.length - 1)];
		call += 1;
		return Promise.resolve({ data: row });
	});
	return {
		from: vi.fn(() => chain),
	};
}

describe('generateSeries X-only failure', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.OPENAI_API_KEY = 'sk-test';

		vi.mocked(loadRunContextFromDb).mockResolvedValue({
			run: {} as never,
			context: {
				seriesRunId: 's1',
				runId: 'run-x',
				userId: 'user-1',
				plan: 'creator',
				brandProfileId: 'brand-1',
				idea: 'idea',
				goal: null,
				notes: null,
				selectedChannels: ['X'],
				publishMode: 'queue_only',
				requestedCounts: { X: 3 },
				quotaRemainingByChannel: { linkedin: 0, x: 10, blog: 0, meta_pool: 0 },
				autopublishCapabilities: {},
				timezone: 'UTC',
				postingWindows: null,
				brandContext: {},
				previousContentJson: [],
				historyWarning: null,
			},
		});

		vi.mocked(getSupabaseService).mockReturnValue(
			mockSupabaseChain([{ status: 'generating' }, { status: 'generating' }]) as never,
		);

		vi.mocked(completeIdeaEngineItemsWithRepair).mockRejectedValue(
			new LlmError('OpenAI request timed out after 90000ms', {
				code: 'llm_timeout',
				provider: 'openai',
				retryable: true,
			}),
		);
	});

	it('marks X channel items failed and finalizes with empty items', async () => {
		await generateSeries('run-x');

		expect(markChannelItemsFailed).toHaveBeenCalledWith(
			'run-x',
			'X',
			expect.stringContaining('timed out'),
		);
		expect(finalizeRunAfterGeneration).toHaveBeenCalledWith(
			expect.objectContaining({
				runId: 'run-x',
				items: [],
				channelErrors: expect.arrayContaining([
					expect.objectContaining({ channel: 'X' }),
				]),
			}),
		);
	});
});
