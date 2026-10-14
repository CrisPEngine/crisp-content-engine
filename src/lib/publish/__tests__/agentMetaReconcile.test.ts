import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentMemoryRecord } from '@/lib/intelligence/types';

const saveMemory = vi.fn(async (_userId: string, memory: ContentMemoryRecord) => memory);
const getMemory = vi.fn();
const contentMemoryRows = vi.fn(async () => ({ data: [], error: null }));

vi.mock('@/lib/featureFlags', () => ({
	isMetaPublishingEnabled: vi.fn(() => true),
}));

vi.mock('@/lib/intelligence/actions', () => ({
	getIntelligenceStore: vi.fn(() => ({
		getMemory,
		saveMemory,
		getBrandBrainById: vi.fn(async () => ({
			id: '03cba45a-6faf-4b6c-a20b-2c2496318b58',
			airtableBrandId: '',
			identity: { name: 'Folian' },
		})),
	})),
}));

vi.mock('@/lib/social/resolveDestination', () => ({
	resolvePublishDestination: vi.fn(async () => null),
}));

function supabaseChain() {
	const builder: Record<string, unknown> = {};
	builder.select = vi.fn(() => builder);
	builder.eq = vi.fn(() => builder);
	builder.in = vi.fn(() => builder);
	builder.lte = vi.fn(() => builder);
	builder.order = vi.fn(() => builder);
	builder.limit = contentMemoryRows;
	builder.maybeSingle = vi.fn(async () => ({ data: null }));
	return builder;
}

vi.mock('@/lib/supabaseService', () => ({
	getSupabaseService: vi.fn(() => ({
		from: vi.fn(() => supabaseChain()),
	})),
}));

describe('reconcileDueAgentMetaScheduledContent', () => {
	beforeEach(() => {
		saveMemory.mockClear();
		getMemory.mockReset();
		contentMemoryRows.mockReset();
	});

	it('marks overdue scheduled instagram content failed when destination is missing', async () => {
		const memory: ContentMemoryRecord = {
			id: 'f1f6d564',
			userId: 'user-1',
			brandBrainId: '03cba45a-6faf-4b6c-a20b-2c2496318b58',
			channel: 'instagram',
			body: 'Caption',
			publicationStatus: 'scheduled',
			publicationDate: '2026-10-09T15:30:00.000Z',
			createdAt: '2026-10-07T00:00:00.000Z',
		};

		contentMemoryRows.mockResolvedValueOnce({
			data: [
				{
					id: memory.id,
					user_id: memory.userId,
					channel: memory.channel,
					publication_status: memory.publicationStatus,
					publication_date: memory.publicationDate,
					brand_brain_id: memory.brandBrainId,
				},
			],
			error: null,
		});
		getMemory.mockResolvedValue(memory);

		const { reconcileDueAgentMetaScheduledContent } = await import('@/lib/publish/agentMetaJob');
		const stats = await reconcileDueAgentMetaScheduledContent({ now: new Date('2026-10-13T00:00:00.000Z') });

		expect(stats.failed).toBe(1);
		expect(saveMemory).toHaveBeenCalled();
		expect(saveMemory.mock.calls[0]?.[1].publicationStatus).toBe('failed');
	});
});
