import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentMemoryRecord } from '@/lib/intelligence/types';
import { getNativeContentStore, setNativeContentStoreForTests } from '@/lib/media/store';

vi.mock('@/lib/featureFlags', () => ({
	isMetaPublishingEnabled: vi.fn(() => true),
}));

vi.mock('@/lib/social/resolveDestination', () => ({
	resolvePublishDestination: vi.fn(async () => ({
		source: 'native',
		channel: 'instagram',
		provider: 'instagram',
		providerDestinationId: 'ig-user-1',
		displayName: 'Folian',
		handle: 'folian.app',
		destinationId: 'dest-1',
		authorizationId: 'auth-1',
	})),
}));

vi.mock('@/lib/social/authorizationSecrets', () => ({
	getAuthorizationSecrets: vi.fn(async () => ({ accessToken: 'token' })),
}));

vi.mock('@/lib/intelligence/actions', () => ({
	getIntelligenceStore: vi.fn(() => ({
		getBrandBrainById: vi.fn(async () => ({
			id: 'brain-1',
			userId: 'owner-user',
			airtableBrandId: 'recFolian',
			identity: { name: 'Folian' },
			voice: {},
			guardrails: {},
			knowledge: {},
			createdAt: '',
			updatedAt: '',
		})),
		getMemory: vi.fn(),
		saveMemory: vi.fn(),
	})),
}));

type JobRow = {
	id: string;
	user_id: string;
	platform: string;
	content_item_key: string;
	status: string;
	scheduled_time: string;
	next_attempt_at: string | null;
	updated_at: string;
	target_id?: string;
	payload_json?: unknown;
};

const jobs: JobRow[] = [];

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
	let mode: 'select' | 'delete' = 'select';
	const builder: Record<string, unknown> = {};

	const applyFilters = () => jobs.filter((row) => (table === 'publish_jobs' ? matchJob(row, filters) : true));

	builder.select = vi.fn((_cols?: string, opts?: { count?: string; head?: boolean }) => {
		mode = 'select';
		if (opts?.head) {
			return Promise.resolve({ count: 0, error: null });
		}
		return builder;
	});
	builder.eq = vi.fn((col: string, val: unknown) => {
		filters[col] = val;
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
	builder.neq = vi.fn(() => builder);
	builder.order = vi.fn(() => builder);
	builder.limit = vi.fn(() => builder);
	builder.maybeSingle = vi.fn(async () => {
		const rows = applyFilters();
		return { data: rows[0] ?? null, error: null };
	});
	builder.delete = vi.fn(() => {
		mode = 'delete';
		for (const key of Object.keys(filters)) delete filters[key];
		return builder;
	});
	builder.insert = vi.fn(async (row: Record<string, unknown>) => {
		if (table !== 'publish_jobs') return { error: null };
		jobs.push({
			id: `job-${jobs.length + 1}`,
			user_id: String(row.user_id),
			platform: String(row.platform),
			content_item_key: String(row.content_item_key),
			status: String(row.status),
			scheduled_time: String(row.scheduled_time),
			next_attempt_at: (row.next_attempt_at as string | null) ?? null,
			updated_at: new Date().toISOString(),
			target_id: String(row.target_id),
			payload_json: row.payload_json,
		});
		return { error: null };
	});

	return builder;
}

vi.mock('@/lib/supabaseService', () => ({
	getSupabaseService: vi.fn(() => ({
		from: vi.fn((table: string) => {
			if (table === 'social_destinations') {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							maybeSingle: vi.fn(async () => ({ data: { destination_type: 'instagram_professional' } })),
						})),
					})),
				};
			}
			return supabaseFrom(table);
		}),
	})),
}));

describe('syncAgentMetaPublishJob orphan publish_jobs rows', () => {
	const contentId = '95c337f7-128f-43ef-a547-733118dd70b4';
	const publishAt = '2099-06-01T19:15:00.000Z';

	beforeEach(() => {
		jobs.length = 0;
		setNativeContentStoreForTests();
		jobs.push({
			id: 'orphan-1',
			user_id: 'legacy-service-user',
			platform: 'instagram',
			content_item_key: contentId,
			status: 'publishing',
			scheduled_time: '2026-10-20T18:00:00.000Z',
			next_attempt_at: null,
			updated_at: new Date().toISOString(),
		});
	});

	it('clears a publishing row owned by another user and queues a job for the content owner', async () => {
		const store = getNativeContentStore();
		const now = new Date().toISOString();
		await store.saveAsset({
			id: 'asset-1',
			ownerUserId: 'owner-user',
			assetType: 'image',
			sourceType: 'generated',
			storageProvider: 'cloudinary',
			url: 'https://cdn.example.com/hero.jpg',
			provenance: {},
			approvalStatus: 'approved',
			createdAt: now,
			updatedAt: now,
		});
		await store.saveLink({
			id: 'link-1',
			ownerUserId: 'owner-user',
			assetId: 'asset-1',
			targetType: 'content',
			targetId: contentId,
			createdAt: now,
		});

		const memory: ContentMemoryRecord = {
			id: contentId,
			brandBrainId: 'brain-1',
			channel: 'instagram',
			body: 'Caption',
			publicationStatus: 'scheduled',
			publicationDate: publishAt,
		};

		const { syncAgentMetaPublishJob } = await import('@/lib/publish/agentMetaJob');
		const result = await syncAgentMetaPublishJob({
			userId: 'owner-user',
			memory,
			publishAt,
		});

		expect(result.armed).toBe(true);
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.user_id).toBe('owner-user');
		expect(jobs[0]?.status).toBe('queued');
		expect(jobs[0]?.scheduled_time).toBe(publishAt);
	});
});
