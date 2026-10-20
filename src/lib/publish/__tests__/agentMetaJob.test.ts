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

const saveMemory = vi.fn(async (_userId: string, memory: ContentMemoryRecord) => memory);
const getBrandBrainById = vi.fn(async () => ({
	id: 'brain-1',
	userId: 'user-1',
	airtableBrandId: 'recFolian',
	identity: { name: 'Folian' },
	voice: {},
	guardrails: {},
	knowledge: {},
	createdAt: '',
	updatedAt: '',
}));

vi.mock('@/lib/intelligence/actions', () => ({
	getIntelligenceStore: vi.fn(() => ({
		getBrandBrainById,
		getMemory: vi.fn(),
		saveMemory,
	})),
}));

const insert = vi.fn(async () => ({ error: null }));
const update = vi.fn(async () => ({ error: null }));
const maybeSingle = vi.fn(async () => ({ data: null }));
const insertedJob = {
	id: 'job-1',
	user_id: 'user-1',
	platform: 'instagram',
	status: 'queued',
	scheduled_time: '2026-10-08T15:30:00.000Z',
	next_attempt_at: null,
	content_item_key: 'mem-1',
};

function chain() {
	const builder: Record<string, unknown> = {};
	builder.select = vi.fn(() => {
		mode = 'select';
		return builder;
	});
	builder.eq = vi.fn(() => builder);
	let mode: 'select' | 'delete' = 'select';
	builder.in = vi.fn((_col: string, _vals: string[]) => {
		if (mode === 'delete') return Promise.resolve({ error: null });
		return builder;
	});
	builder.neq = vi.fn(() => builder);
	builder.order = vi.fn(() => builder);
	builder.limit = vi.fn(() => ({
		maybeSingle: builder.maybeSingle,
		then: (onFulfilled?: (v: { data: unknown[] }) => unknown) =>
			Promise.resolve({ data: [] }).then(onFulfilled as (v: { data: unknown[] }) => unknown),
	}));
	builder.maybeSingle = vi.fn(async () => {
		if (insert.mock.calls.length > 0) {
			const row = insert.mock.calls.at(-1)?.[0] as Record<string, unknown>;
			return {
				data: {
					...insertedJob,
					user_id: row.user_id,
					platform: row.platform,
					content_item_key: row.content_item_key,
					scheduled_time: row.scheduled_time,
					status: row.status,
				},
				error: null,
			};
		}
		const fromMaybeSingle = maybeSingle.getMockImplementation();
		if (fromMaybeSingle) return fromMaybeSingle();
		return { data: null, error: null };
	});
	builder.insert = insert;
	builder.update = vi.fn((...args: unknown[]) => {
		update(...args);
		return { eq: vi.fn(async () => ({ error: null })) };
	});
	builder.delete = vi.fn(() => {
		mode = 'delete';
		return builder;
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
			return chain();
		}),
	})),
}));

describe('agent Meta publish jobs', () => {
	beforeEach(() => {
		setNativeContentStoreForTests();
		insert.mockClear();
		update.mockClear();
		maybeSingle.mockReset();
		insert.mockClear();
		maybeSingle.mockResolvedValue({ data: null });
	});

	it('queues instagram job with caption and image', async () => {
		const store = getNativeContentStore();
		const now = new Date().toISOString();
		await store.saveAsset({
			id: 'asset-1',
			ownerUserId: 'user-1',
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
			ownerUserId: 'user-1',
			assetId: 'asset-1',
			targetType: 'content',
			targetId: 'mem-1',
			createdAt: now,
		});

		const { syncAgentMetaPublishJob } = await import('@/lib/publish/agentMetaJob');
		const memory: ContentMemoryRecord = {
			id: 'mem-1',
			brandBrainId: 'brain-1',
			channel: 'instagram',
			body: 'Caption text',
			publicationStatus: 'scheduled',
		};

		const result = await syncAgentMetaPublishJob({
			userId: 'user-1',
			memory,
			publishAt: '2030-06-01T15:30:00.000Z',
		});

		expect(result.armed).toBe(true);
		expect(insert).toHaveBeenCalled();
		const row = insert.mock.calls[0]?.[0];
		expect(row.platform).toBe('instagram');
		expect(row.payload_json.text).toBe('Caption text');
		expect(row.payload_json.imageUrl).toBe('https://cdn.example.com/hero.jpg');
		expect(row.payload_json.source).toBe('agent');
	});

	it('uses brand brain id when airtableBrandId is missing', async () => {
		getBrandBrainById.mockResolvedValueOnce({
			id: '03cba45a-6faf-4b6c-a20b-2c2496318b58',
			userId: 'user-1',
			airtableBrandId: '',
			identity: { name: 'Folian' },
			voice: {},
			guardrails: {},
			knowledge: {},
			createdAt: '',
			updatedAt: '',
		});

		const { syncAgentMetaPublishJob } = await import('@/lib/publish/agentMetaJob');
		const memory: ContentMemoryRecord = {
			id: 'mem-3',
			brandBrainId: '03cba45a-6faf-4b6c-a20b-2c2496318b58',
			channel: 'instagram',
			body: 'Caption text',
			publicationStatus: 'scheduled',
			metadata: { image_reference_url: 'https://cdn.example.com/hero.jpg' },
		};

		await syncAgentMetaPublishJob({
			userId: 'user-1',
			memory,
			publishAt: '2026-10-09T15:30:00.000Z',
		});

		expect(insert).toHaveBeenCalled();
		expect(insert.mock.calls[0]?.[0].brand_profile_id).toBe('03cba45a-6faf-4b6c-a20b-2c2496318b58');
	});

	it('fails instagram scheduling without an image', async () => {
		const { syncAgentMetaPublishJob } = await import('@/lib/publish/agentMetaJob');
		const memory: ContentMemoryRecord = {
			id: 'mem-2',
			brandBrainId: 'brain-1',
			channel: 'instagram',
			body: 'Caption only',
			publicationStatus: 'scheduled',
		};

		await expect(
			syncAgentMetaPublishJob({
				userId: 'user-1',
				memory,
				publishAt: '2030-06-01T15:30:00.000Z',
			}),
		).rejects.toMatchObject({
			code: 'publish_queue_failed',
		});
	});
});
