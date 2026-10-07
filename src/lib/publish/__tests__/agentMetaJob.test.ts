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

function chain() {
	const builder: Record<string, unknown> = {};
	builder.select = vi.fn(() => builder);
	builder.eq = vi.fn(() => builder);
	builder.in = vi.fn(() => builder);
	builder.order = vi.fn(() => builder);
	builder.limit = vi.fn(async () => ({ data: [] }));
	builder.maybeSingle = maybeSingle;
	builder.insert = insert;
	builder.update = vi.fn((...args: unknown[]) => {
		update(...args);
		return { eq: vi.fn(async () => ({ error: null })) };
	});
	builder.then = undefined;
	return builder;
}

vi.mock('@/lib/supabaseService', () => ({
	getSupabaseService: vi.fn(() => ({
		from: vi.fn(() => chain()),
	})),
}));

describe('agent Meta publish jobs', () => {
	beforeEach(() => {
		setNativeContentStoreForTests();
		insert.mockClear();
		update.mockClear();
		maybeSingle.mockReset();
		maybeSingle
			.mockResolvedValueOnce({ data: { destination_type: 'instagram_professional' } })
			.mockResolvedValue({ data: null });
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
			publishAt: '2026-10-08T15:30:00.000Z',
		});

		expect(result.armed).toBe(true);
		expect(insert).toHaveBeenCalled();
		const row = insert.mock.calls[0]?.[0];
		expect(row.platform).toBe('instagram');
		expect(row.payload_json.text).toBe('Caption text');
		expect(row.payload_json.imageUrl).toBe('https://cdn.example.com/hero.jpg');
		expect(row.payload_json.source).toBe('agent');
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
				publishAt: '2026-10-08T15:30:00.000Z',
			}),
		).rejects.toMatchObject({
			code: 'publish_queue_failed',
		});
	});
});
