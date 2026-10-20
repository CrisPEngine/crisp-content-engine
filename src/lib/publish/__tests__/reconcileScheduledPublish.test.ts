import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentMemoryRecord } from '@/lib/intelligence/types';

const saveMemory = vi.fn(async (_userId: string, memory: ContentMemoryRecord) => memory);
const getMemory = vi.fn();
const syncMeta = vi.fn(async () => ({ repaired: true }));
const contentMemoryRows = vi.fn(async () => ({ data: [], error: null }));

vi.mock('@/lib/featureFlags', () => ({
	isMetaPublishingEnabled: vi.fn(() => true),
	isThreadsPublishingEnabled: vi.fn(() => true),
}));

vi.mock('@/lib/intelligence/actions', () => ({
	getIntelligenceStore: vi.fn(() => ({
		getMemory,
		saveMemory,
		getBrandBrainById: vi.fn(async () => ({
			id: 'brain-1',
			airtableBrandId: '',
			identity: { name: 'Folian' },
		})),
	})),
}));

vi.mock('@/lib/publish/agentMetaJob', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/publish/agentMetaJob')>();
	return {
		...actual,
		repairAgentMetaPublishJobIfMissing: syncMeta,
	};
});

function supabaseChain() {
	const builder: Record<string, unknown> = {};
	builder.select = vi.fn(() => builder);
	builder.eq = vi.fn(() => builder);
	builder.in = vi.fn(() => builder);
	builder.not = vi.fn(() => builder);
	builder.lte = vi.fn(() => builder);
	builder.order = vi.fn(() => builder);
	builder.limit = vi.fn((n?: number) => {
		if (n === 1) return builder;
		return contentMemoryRows();
	});
	builder.maybeSingle = vi.fn(async () => ({ data: null }));
	return builder;
}

vi.mock('@/lib/supabaseService', () => ({
	getSupabaseService: vi.fn(() => ({
		from: vi.fn(() => supabaseChain()),
	})),
}));

describe('reconcileScheduledNativePublishJobs', () => {
	beforeEach(() => {
		saveMemory.mockClear();
		getMemory.mockReset();
		syncMeta.mockClear();
		contentMemoryRows.mockReset();
	});

	it('promotes approved rows with publicationDate to scheduled and repairs the publish job', async () => {
		const memory: ContentMemoryRecord = {
			id: 'content-1',
			userId: 'user-1',
			brandBrainId: 'brain-1',
			channel: 'instagram',
			body: 'Caption',
			publicationStatus: 'approved',
			publicationDate: '2026-10-20T07:43:00.000Z',
			createdAt: '2026-10-19T00:00:00.000Z',
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

		const { reconcileScheduledNativePublishJobs } = await import('@/lib/publish/reconcileScheduledPublish');
		const stats = await reconcileScheduledNativePublishJobs({ now: new Date('2026-10-20T08:00:00.000Z') });

		expect(saveMemory).toHaveBeenCalled();
		expect(saveMemory.mock.calls[0]?.[1].publicationStatus).toBe('scheduled');
		expect(syncMeta).toHaveBeenCalled();
		expect(stats.repaired).toBe(1);
	});
});
