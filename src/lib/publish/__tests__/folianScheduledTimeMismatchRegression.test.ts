import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentMemoryRecord } from '@/lib/intelligence/types';
import { publishInstantsMatch, toPublishInstantIso } from '@/lib/publish/publishInstant';
import { isPublishJobDue } from '@/lib/publish/publishJobActive';

const CONTENT_ID = '95c337f7-128f-43ef-a547-733118dd70b4';
const PUBLICATION_DATE = '2026-10-20T20:20Z';
const WORKER_NOW = '2026-10-20T20:30:00.000Z';

type JobRow = {
	id: string;
	user_id: string;
	platform: string;
	content_item_key: string;
	status: string;
	scheduled_time: string;
	next_attempt_at: string | null;
	updated_at: string;
};

const jobs: JobRow[] = [];
const memories = new Map<string, ContentMemoryRecord>();

vi.mock('@/lib/intelligence/actions', () => ({
	getIntelligenceStore: vi.fn(() => ({
		getMemory: vi.fn(async (userId: string, id: string) => memories.get(`${userId}:${id}`) ?? null),
		saveMemory: vi.fn(async (userId: string, memory: ContentMemoryRecord) => {
			memories.set(`${userId}:${memory.id}`, memory);
			return memory;
		}),
		getBrandBrainById: vi.fn(async () => ({
			id: 'brain-1',
			airtableBrandId: 'recFolian',
			identity: { name: 'Folian' },
		})),
	})),
}));

function matchJob(row: JobRow, filters: Record<string, unknown>): boolean {
	for (const [key, value] of Object.entries(filters)) {
		if (key === 'status_in') {
			if (!(value as string[]).includes(row.status)) return false;
			continue;
		}
		if ((row as Record<string, unknown>)[key] !== value) return false;
	}
	return true;
}

function supabaseFrom(table: string) {
	const filters: Record<string, unknown> = {};
	let mode: 'select' | 'delete' | 'update' = 'select';
	const builder: Record<string, unknown> = {};
	const applyFilters = () => {
		if (table === 'publish_jobs') return jobs.filter((row) => matchJob(row, filters));
		if (table === 'content_memory') {
			return [...memories.values()].filter((memory) => {
				if (filters.user_id && memory.userId !== filters.user_id) return false;
				if (filters.publication_status && memory.publicationStatus !== filters.publication_status) return false;
				return true;
			});
		}
		return [];
	};

	builder.select = vi.fn(() => {
		mode = 'select';
		return builder;
	});
	builder.eq = vi.fn((col: string, val: unknown) => {
		if (table === 'content_memory') {
			if (col === 'user_id') filters.user_id = val;
			if (col === 'publication_status') filters.publication_status = val;
		} else {
			filters[col] = val;
		}
		return builder;
	});
	builder.in = vi.fn((col: string, vals: string[]) => {
		if (col === 'status') filters.status_in = vals;
		if (mode === 'delete') {
			const toDelete = applyFilters();
			for (const row of toDelete) {
				const idx = jobs.indexOf(row);
				if (idx >= 0) jobs.splice(idx, 1);
			}
			return Promise.resolve({ error: null });
		}
		return builder;
	});
	builder.not = vi.fn(() => builder);
	builder.lte = vi.fn(() => builder);
	builder.order = vi.fn(() => builder);
	builder.limit = vi.fn(() => ({
		maybeSingle: builder.maybeSingle,
		then: (onFulfilled?: (v: { data: unknown[] }) => unknown) =>
			Promise.resolve({
				data: applyFilters().map((memory) =>
					table === 'content_memory'
						? {
								id: memory.id,
								user_id: memory.userId,
								channel: memory.channel,
								publication_status: memory.publicationStatus,
								publication_date: memory.publicationDate,
								brand_brain_id: memory.brandBrainId,
								metadata: memory.metadata,
							}
						: memory,
				),
				error: null,
			}).then(onFulfilled as (v: { data: unknown[] }) => unknown),
	}));
	builder.maybeSingle = vi.fn(async () => {
		const rows = applyFilters();
		return { data: rows[0] ?? null, error: null };
	});
	builder.update = vi.fn((patch: Record<string, unknown>) => {
		mode = 'update';
		const updatePatch = patch;
		return {
			eq: vi.fn(() => ({
				in: vi.fn(async () => {
					for (const row of applyFilters()) {
						Object.assign(row, updatePatch);
					}
					return { error: null };
				}),
			})),
		};
	});
	builder.delete = vi.fn(() => {
		mode = 'delete';
		for (const key of Object.keys(filters)) delete filters[key];
		return builder;
	});

	return builder;
}

vi.mock('@/lib/supabaseService', () => ({
	getSupabaseService: vi.fn(() => ({
		from: vi.fn((table: string) => supabaseFrom(table)),
	})),
}));

describe('Folian 95c337 scheduled_time_mismatch regression', () => {
	const userId = 'folian-user';

	beforeEach(() => {
		jobs.length = 0;
		memories.clear();
		jobs.push({
			id: 'job-queued-1',
			user_id: userId,
			platform: 'instagram',
			content_item_key: CONTENT_ID,
			status: 'queued',
			scheduled_time: '2026-10-20T20:45:00.000Z',
			next_attempt_at: null,
			updated_at: '2026-10-20T20:20:00.000Z',
		});
		memories.set(`${userId}:${CONTENT_ID}`, {
			id: CONTENT_ID,
			userId,
			brandBrainId: 'brain-1',
			channel: 'instagram',
			body: 'Caption',
			publicationStatus: 'scheduled',
			publicationDate: PUBLICATION_DATE,
			createdAt: '2026-10-20T00:00:00.000Z',
		});
	});

	it('treats 20:20Z and 20:20:00.000Z as the same instant', () => {
		expect(publishInstantsMatch(PUBLICATION_DATE, '2026-10-20T20:20:00.000Z')).toBe(true);
		expect(toPublishInstantIso(PUBLICATION_DATE)).toBe('2026-10-20T20:20:00.000Z');
	});

	it('does not mark overdue content failed when reconcile realigns the queued job to publicationDate', async () => {
		const { reconcileScheduledNativePublishJobs } = await import('@/lib/publish/reconcileScheduledPublish');
		const stats = await reconcileScheduledNativePublishJobs({ now: new Date(WORKER_NOW) });

		expect(stats.failed).toBe(0);
		expect(jobs[0]?.scheduled_time).toBe('2026-10-20T20:20:00.000Z');
		const memory = memories.get(`${userId}:${CONTENT_ID}`);
		expect(memory?.publicationStatus).toBe('scheduled');
		expect(stats.skipped).toBeGreaterThan(0);
	});

	it('picks up the realigned queued job as due at 20:30Z', () => {
		const job = jobs[0]!;
		job.scheduled_time = '2026-10-20T20:20:00.000Z';
		expect(isPublishJobDue(job, new Date(WORKER_NOW))).toBe(true);
		expect(job.scheduled_time <= WORKER_NOW).toBe(true);
	});
});
