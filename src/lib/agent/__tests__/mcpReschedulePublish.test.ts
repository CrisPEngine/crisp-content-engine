import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryAgentStore, setAgentStoreForTests } from '@/lib/agent/controlStore';
import { issueAgentCredential } from '@/lib/agent/credentials';
import { executeFromAuthorization } from '@/lib/agent/execute';
import { FOLIAN_GROK_CAPABILITIES, FOLIAN_GROK_RATE_LIMIT } from '@/lib/agent/policy';
import { setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { createMemoryIntelligenceStore } from '@/lib/intelligence/memoryStore';
import { FOLIAN_USER_ID, folianGuardrails, folianIdentity, folianKnowledge, folianVoice } from '@/lib/intelligence/__tests__/folianFixture';
import { getNativeContentStore, setNativeContentStoreForTests } from '@/lib/media/store';

vi.mock('@/lib/featureFlags', () => ({
	isMetaPublishingEnabled: vi.fn(() => true),
	isThreadsPublishingEnabled: vi.fn(() => true),
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
	brand_profile_id?: string;
	payload_json?: unknown;
	airtable_record_id?: string;
	error_message?: string | null;
	attempts?: number;
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
		if (opts?.head) return Promise.resolve({ count: 0, error: null });
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
	builder.not = vi.fn(() => builder);
	builder.lte = vi.fn(() => builder);
	builder.lt = vi.fn(() => builder);
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
			brand_profile_id: String(row.brand_profile_id),
			payload_json: row.payload_json,
			airtable_record_id: String(row.airtable_record_id),
			error_message: (row.error_message as string | null) ?? null,
			attempts: Number(row.attempts ?? 0),
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
			if (table === 'content_memory') {
				return supabaseFrom(table);
			}
			return supabaseFrom(table);
		}),
	})),
}));

async function call(secret: string, action: string, payload: Record<string, unknown> = {}, idempotencyKey?: string) {
	return executeFromAuthorization({ authorization: `Bearer ${secret}`, action, payload, idempotencyKey });
}

describe('MCP cce_reschedule_content publish queue', () => {
	let folianId = '';
	let folianSecret = '';
	const contentId = '95c337f7-128f-43ef-a547-733118dd70b4';
	const publishAt = '2099-06-01T19:15:00.000Z';

	beforeEach(async () => {
		jobs.length = 0;
		setAgentStoreForTests(createMemoryAgentStore());
		setNativeContentStoreForTests();
		const store = createMemoryIntelligenceStore();
		setIntelligenceStoreForTests(store);
		const folian = await store.upsertBrandBrain(FOLIAN_USER_ID, 'recFolian', {
			identity: folianIdentity,
			voice: folianVoice,
			guardrails: folianGuardrails,
			knowledge: folianKnowledge,
		});
		folianId = folian.id;
		folianSecret = (
			await issueAgentCredential({
				name: 'Folian Marketing Grok',
				ownerUserId: FOLIAN_USER_ID,
				allowedBrandIds: [folian.id],
				capabilities: FOLIAN_GROK_CAPABILITIES,
				scope: 'BRAND',
				environment: 'test',
				rateLimit: FOLIAN_GROK_RATE_LIMIT,
			})
		).secret;

		const assetStore = getNativeContentStore();
		const now = new Date().toISOString();
		await assetStore.saveAsset({
			id: 'asset-1',
			ownerUserId: FOLIAN_USER_ID,
			assetType: 'image',
			sourceType: 'generated',
			storageProvider: 'cloudinary',
			url: 'https://cdn.example.com/hero.jpg',
			provenance: {},
			approvalStatus: 'approved',
			createdAt: now,
			updatedAt: now,
		});
		await assetStore.saveLink({
			id: 'link-1',
			ownerUserId: FOLIAN_USER_ID,
			assetId: 'asset-1',
			targetType: 'content',
			targetId: contentId,
			createdAt: now,
		});

		await store.saveMemory(FOLIAN_USER_ID, {
			id: contentId,
			brandBrainId: folianId,
			channel: 'instagram',
			body: 'Scheduled caption',
			publicationStatus: 'scheduled',
			publicationDate: '2026-10-20T18:00:00.000Z',
		});

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

	afterEach(() => {
		setAgentStoreForTests(undefined);
		setIntelligenceStoreForTests(undefined);
		setNativeContentStoreForTests(undefined);
	});

	it('returns publisherArmed true only when a queueable job exists for the MCP owner after reschedule', async () => {
		const rescheduled = await call(
			folianSecret,
			'cce_reschedule_content',
			{ brandId: folianId, contentId, publishAt },
			'mcp-reschedule-orphan',
		);
		expect(rescheduled.body.ok).toBe(true);
		expect((rescheduled.body.result as { publisherArmed: boolean }).publisherArmed).toBe(true);
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.user_id).toBe(FOLIAN_USER_ID);
		expect(jobs[0]?.status).toBe('queued');
		expect(jobs[0]?.scheduled_time).toBe(publishAt);
	});
});
