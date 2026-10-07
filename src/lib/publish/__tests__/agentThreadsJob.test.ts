import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentMemoryRecord } from '@/lib/intelligence/types';
import { getNativeContentStore, setNativeContentStoreForTests } from '@/lib/media/store';

vi.mock('@/lib/featureFlags', () => ({
	isThreadsPublishingEnabled: vi.fn(() => true),
}));

vi.mock('@/lib/social/resolveDestination', () => ({
	resolvePublishDestination: vi.fn(async () => ({
		source: 'native',
		channel: 'threads',
		provider: 'threads',
		providerDestinationId: 'threads-user-1',
		displayName: '@folian.app',
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
const del = vi.fn(async () => ({ error: null }));
const maybeSingle = vi.fn(async () => ({ data: null }));

function chain() {
	const builder: Record<string, unknown> = {};
	const terminal = () => builder;
	builder.select = vi.fn(() => builder);
	builder.eq = vi.fn(() => builder);
	builder.in = vi.fn(() => builder);
	builder.order = vi.fn(() => builder);
	builder.limit = vi.fn(async () => ({ data: [] }));
	builder.maybeSingle = maybeSingle;
	builder.insert = insert;
	builder.update = vi.fn((...args: unknown[]) => {
		update(...args);
		return {
			eq: vi.fn(async () => ({ error: null })),
		};
	});
	builder.delete = del;
	return builder;
}

vi.mock('@/lib/supabaseService', () => ({
	getSupabaseService: vi.fn(() => ({
		from: vi.fn(() => chain()),
	})),
}));

describe('agent Threads publish jobs', () => {
	beforeEach(() => {
		setNativeContentStoreForTests();
		insert.mockClear();
		update.mockClear();
		del.mockClear();
		maybeSingle.mockReset();
		maybeSingle.mockResolvedValue({ data: null });
		saveMemory.mockClear();
	});

	it('builds payload from body without prepending hook', async () => {
		const { buildAgentThreadsPayload } = await import('@/lib/publish/agentThreadsJob');
		const memory: ContentMemoryRecord = {
			id: 'mem-1',
			userId: 'user-1',
			brandBrainId: 'brain-1',
			channel: 'threads',
			hook: 'Hook line',
			body: 'Hook line\n\nFull post copy',
			publicationStatus: 'scheduled',
			createdAt: new Date().toISOString(),
		};
		const payload = buildAgentThreadsPayload(memory, 'threads-user-1', 'dest-1');
		expect(payload.text).toBe('Hook line\n\nFull post copy');
		expect(payload.source).toBe('agent');
		expect(payload.imageUrl).toBeNull();
	});

	it('prefers attached image url over metadata fallback in payload', async () => {
		const { buildAgentThreadsPayload } = await import('@/lib/publish/agentThreadsJob');
		const memory: ContentMemoryRecord = {
			id: 'mem-1',
			userId: 'user-1',
			brandBrainId: 'brain-1',
			channel: 'threads',
			body: 'Post with image',
			publicationStatus: 'scheduled',
			metadata: { imageReferenceUrl: 'https://legacy.example/image.jpg' },
			createdAt: new Date().toISOString(),
		};
		const payload = buildAgentThreadsPayload(memory, 'threads-user-1', 'dest-1', 'https://res.cloudinary.com/demo/image.jpg');
		expect(payload.imageUrl).toBe('https://res.cloudinary.com/demo/image.jpg');
	});

	it('falls back to metadata image url when no attachment is passed', async () => {
		const { buildAgentThreadsPayload } = await import('@/lib/publish/agentThreadsJob');
		const memory: ContentMemoryRecord = {
			id: 'mem-1',
			userId: 'user-1',
			brandBrainId: 'brain-1',
			channel: 'threads',
			body: 'Post',
			publicationStatus: 'scheduled',
			metadata: { image_reference_url: 'https://cdn.example/photo.png' },
			createdAt: new Date().toISOString(),
		};
		const payload = buildAgentThreadsPayload(memory, 'threads-user-1', 'dest-1');
		expect(payload.imageUrl).toBe('https://cdn.example/photo.png');
	});

	it('queues a Threads job with image from linked content assets', async () => {
		const store = getNativeContentStore();
		const now = new Date().toISOString();
		await store.saveAsset({
			id: 'asset-1',
			ownerUserId: 'user-1',
			assetType: 'image',
			sourceType: 'generated',
			storageProvider: 'cloudinary',
			url: 'https://res.cloudinary.com/demo/attached.jpg',
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

		const { syncAgentThreadsPublishJob } = await import('@/lib/publish/agentThreadsJob');
		const memory: ContentMemoryRecord = {
			id: 'mem-1',
			userId: 'user-1',
			brandBrainId: 'brain-1',
			channel: 'threads',
			body: 'Scheduled post with image',
			publicationStatus: 'scheduled',
			createdAt: now,
		};
		await syncAgentThreadsPublishJob({
			userId: 'user-1',
			memory,
			publishAt: '2030-01-01T00:00:00.000Z',
		});
		const row = insert.mock.calls[0][0];
		expect(row.payload_json.imageUrl).toBe('https://res.cloudinary.com/demo/attached.jpg');
	});

	it('re-sync updates payload with linked image on existing job', async () => {
		const store = getNativeContentStore();
		const now = new Date().toISOString();
		await store.saveAsset({
			id: 'asset-2',
			ownerUserId: 'user-1',
			assetType: 'image',
			sourceType: 'generated',
			storageProvider: 'cloudinary',
			url: 'https://res.cloudinary.com/demo/resync.jpg',
			provenance: {},
			approvalStatus: 'approved',
			createdAt: now,
			updatedAt: now,
		});
		await store.saveLink({
			id: 'link-2',
			ownerUserId: 'user-1',
			assetId: 'asset-2',
			targetType: 'content',
			targetId: 'mem-2',
			createdAt: now,
		});
		maybeSingle.mockResolvedValue({ data: { id: 'job-1', status: 'queued' } });

		const { syncAgentThreadsPublishJob } = await import('@/lib/publish/agentThreadsJob');
		const memory: ContentMemoryRecord = {
			id: 'mem-2',
			userId: 'user-1',
			brandBrainId: 'brain-1',
			channel: 'threads',
			body: 'Rescheduled post',
			publicationStatus: 'scheduled',
			createdAt: now,
		};
		await syncAgentThreadsPublishJob({
			userId: 'user-1',
			memory,
			publishAt: '2030-06-01T12:00:00.000Z',
		});
		expect(update).toHaveBeenCalled();
		const row = update.mock.calls[0]?.[0] as { payload_json: { imageUrl: string } };
		expect(row.payload_json.imageUrl).toBe('https://res.cloudinary.com/demo/resync.jpg');
	});

	it('queues a new Threads job on schedule', async () => {
		const { syncAgentThreadsPublishJob } = await import('@/lib/publish/agentThreadsJob');
		const memory: ContentMemoryRecord = {
			id: 'mem-1',
			userId: 'user-1',
			brandBrainId: 'brain-1',
			channel: 'threads',
			body: 'Scheduled post',
			publicationStatus: 'scheduled',
			createdAt: new Date().toISOString(),
		};
		const result = await syncAgentThreadsPublishJob({
			userId: 'user-1',
			memory,
			publishAt: '2020-01-01T00:00:00.000Z',
		});
		expect(result.armed).toBe(true);
		expect(insert).toHaveBeenCalled();
		const row = insert.mock.calls[0][0];
		expect(row.platform).toBe('threads');
		expect(row.payload_json.text).toBe('Scheduled post');
		expect(new Date(row.scheduled_time).getTime()).toBeGreaterThanOrEqual(Date.now() - 5000);
	});

	it('updates agent content when a job publishes', async () => {
		const { applyThreadsJobOutcomeToAgentContent } = await import('@/lib/publish/agentThreadsJob');
		const { getIntelligenceStore } = await import('@/lib/intelligence/actions');
		const memory: ContentMemoryRecord = {
			id: 'mem-1',
			userId: 'user-1',
			brandBrainId: 'brain-1',
			channel: 'threads',
			body: 'Post',
			publicationStatus: 'scheduled',
			createdAt: new Date().toISOString(),
		};
		vi.mocked(getIntelligenceStore).mockReturnValue({
			getBrandBrainById,
			getMemory: vi.fn(async () => memory),
			saveMemory,
		} as never);

		const applied = await applyThreadsJobOutcomeToAgentContent({
			user_id: 'user-1',
			content_item_key: 'mem-1',
			payload_json: { source: 'agent', memoryId: 'mem-1' },
			status: 'published',
			remote_post_id: 'post-123',
		});
		expect(applied).toBe(true);
		expect(saveMemory).toHaveBeenCalledWith(
			'user-1',
			expect.objectContaining({ publicationStatus: 'published', externalPostId: 'post-123' }),
		);
	});
});
