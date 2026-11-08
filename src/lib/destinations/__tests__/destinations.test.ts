import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { createMemoryIntelligenceStore } from '@/lib/intelligence/memoryStore';
import { FOLIAN_USER_ID, folianGuardrails, folianIdentity, folianKnowledge, folianVoice } from '@/lib/intelligence/__tests__/folianFixture';
import { createDestination, diffTaxonomy, listDestinations, toView, updateDestination } from '../service';
import { decryptCredentials, encryptCredentials } from '../secrets';
import { assertSafeDestinationUrl } from '../ssrf';
import { createMemoryDestinationStore, getDestinationStore, setDestinationStoreForTests } from '../store';
import { defaultDestinationSettings } from '../types';
import type { DestinationTaxonomy } from '@/lib/publishing/destinationTaxonomy';

const taxonomy = (categories: Array<[string, string]>): DestinationTaxonomy => ({
	destination: 'site',
	schemaVersion: 1,
	categoryCreationPolicy: 'closed',
	categories: categories.map(([id, name]) => ({ id, name, description: '' })),
	contentTypes: ['guide'],
	tags: { policy: 'open' },
	tools: [],
});

const resolvesTo = (address: string) => (async () => [{ address, family: 4 }]) as never;

describe('website destinations', () => {
	const env: Record<string, string | undefined> = {};

	beforeEach(() => {
		setDestinationStoreForTests(createMemoryDestinationStore());
		for (const key of ['FOLIAN_CONTENT_API_URL', 'FOLIAN_CONTENT_API_KEY', 'LINKEDIN_ENCRYPTION_KEY', 'FOLIAN_BRAND_ID']) env[key] = process.env[key];
		process.env.LINKEDIN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
	});

	afterEach(() => {
		setDestinationStoreForTests(null);
		setIntelligenceStoreForTests(undefined);
		for (const [key, value] of Object.entries(env)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	async function brand() {
		const store = createMemoryIntelligenceStore();
		setIntelligenceStoreForTests(store);
		return store.upsertBrandBrain(FOLIAN_USER_ID, 'recDest', { identity: folianIdentity, voice: folianVoice, guardrails: folianGuardrails, knowledge: folianKnowledge });
	}

	it('rejects non-https, credentialed, private and privately resolving URLs', async () => {
		await expect(assertSafeDestinationUrl('http://cms.example.com', resolvesTo('93.184.216.34'))).rejects.toThrow(/https/);
		await expect(assertSafeDestinationUrl('https://user:pass@cms.example.com', resolvesTo('93.184.216.34'))).rejects.toThrow(/credentials/);
		await expect(assertSafeDestinationUrl('https://localhost', resolvesTo('127.0.0.1'))).rejects.toThrow(/public/);
		await expect(assertSafeDestinationUrl('https://169.254.169.254', resolvesTo('169.254.169.254'))).rejects.toThrow(/public/);
		await expect(assertSafeDestinationUrl('https://cms.example.com', resolvesTo('10.0.0.5'))).rejects.toThrow(/private/);
		await expect(assertSafeDestinationUrl('https://cms.example.com:8443', resolvesTo('93.184.216.34'))).rejects.toThrow(/port/);
		await expect(assertSafeDestinationUrl('https://cms.example.com/api', resolvesTo('93.184.216.34'))).resolves.toBeInstanceOf(URL);
	});

	it('encrypts credentials and never returns them in the browser view', async () => {
		const sealed = encryptCredentials({ apiKey: 'secret-key-value' });
		expect(sealed).not.toContain('secret-key-value');
		expect(decryptCredentials(sealed).apiKey).toBe('secret-key-value');
		const brain = await brand();
		const store = getDestinationStore();
		const saved = await store.save({
			id: crypto.randomUUID(),
			ownerUserId: FOLIAN_USER_ID,
			brandId: brain.id,
			key: 'site',
			provider: 'payload_content_api',
			name: 'Site',
			baseUrl: 'https://cms.example.com',
			enabled: true,
			credentialSource: 'stored',
			settings: defaultDestinationSettings(),
			taxonomy: taxonomy([['guides', 'Guides']]),
			taxonomySyncedAt: null,
			health: { status: 'unknown', checkedAt: null, message: null, latencyMs: null },
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		await store.saveSecret(saved.id, sealed);
		const view = await toView(saved);
		expect(view.hasCredentials).toBe(true);
		expect(JSON.stringify(view)).not.toContain('secret-key-value');
		expect(view.capabilities.publishing).toBe(false);
	});

	it('refuses an unavailable provider and validates category settings against the CMS taxonomy', async () => {
		const brain = await brand();
		await expect(
			createDestination(FOLIAN_USER_ID, { brandId: brain.id, name: 'Blog', provider: 'wordpress', baseUrl: 'https://blog.example.com', apiKey: 'k' }),
		).rejects.toMatchObject({ code: 'provider_unavailable' });
		await expect(
			createDestination(FOLIAN_USER_ID, { brandId: brain.id, name: 'Local', provider: 'payload_content_api', baseUrl: 'https://localhost', apiKey: 'k' }),
		).rejects.toMatchObject({ code: 'unsafe_url' });
		const saved = await getDestinationStore().save({
			id: crypto.randomUUID(),
			ownerUserId: FOLIAN_USER_ID,
			brandId: brain.id,
			key: 'site',
			provider: 'payload_content_api',
			name: 'Site',
			baseUrl: 'https://cms.example.com',
			enabled: true,
			credentialSource: 'stored',
			settings: defaultDestinationSettings(),
			taxonomy: taxonomy([['guides', 'Guides']]),
			taxonomySyncedAt: null,
			health: { status: 'unknown', checkedAt: null, message: null, latencyMs: null },
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		await expect(updateDestination(FOLIAN_USER_ID, saved.id, { settings: { defaultCategoryId: 'missing' } })).rejects.toMatchObject({ code: 'invalid_category' });
		const updated = await updateDestination(FOLIAN_USER_ID, saved.id, {
			settings: { defaultCategoryId: 'guides', topicMappings: [{ topic: 'novel', categoryId: 'guides' }], allowPublish: true as never },
		});
		expect(updated.settings.defaultCategoryId).toBe('guides');
		expect(updated.settings.allowPublish).toBe(false);
		const disabled = await updateDestination(FOLIAN_USER_ID, saved.id, { enabled: false });
		expect(disabled.health.status).toBe('disabled');
	});

	it('records the environment Folian destination once for the Folian brand only', async () => {
		const brain = await brand();
		process.env.FOLIAN_BRAND_ID = brain.id;
		process.env.FOLIAN_CONTENT_API_URL = 'https://folian.example.com';
		process.env.FOLIAN_CONTENT_API_KEY = 'env-key';
		const first = await listDestinations(FOLIAN_USER_ID, brain.id);
		const second = await listDestinations(FOLIAN_USER_ID, brain.id);
		expect(first.map((item) => item.key)).toEqual(['folian']);
		expect(second).toHaveLength(1);
		expect(second[0].credentialSource).toBe('environment');
		await expect(updateDestination(FOLIAN_USER_ID, second[0].id, { apiKey: 'other' })).rejects.toMatchObject({ code: 'environment_managed' });
	});

	it('detects added, removed and renamed categories and broken mappings', () => {
		const settings = { ...defaultDestinationSettings(), defaultCategoryId: 'old', topicMappings: [{ topic: 'novel', categoryId: 'old' }] };
		const diff = diffTaxonomy(taxonomy([['old', 'Old'], ['keep', 'Keep']]), taxonomy([['keep', 'Kept'], ['new', 'New']]), settings);
		expect(diff.added).toEqual([{ id: 'new', name: 'New' }]);
		expect(diff.removed).toEqual([{ id: 'old', name: 'Old' }]);
		expect(diff.renamed).toEqual([{ id: 'keep', from: 'Keep', to: 'Kept' }]);
		expect(diff.missingDefault).toBe(true);
		expect(diff.unmappedTopics).toEqual(['novel']);
	});
});
