import 'server-only';

import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { editorialDestinationForBrand } from '@/lib/publishing/destinationRegistry';
import type { DestinationTaxonomy } from '@/lib/publishing/destinationTaxonomy';
import { PROVIDERS, providerDefinition } from './providers';
import { decryptCredentials, encryptCredentials } from './secrets';
import { assertSafeDestinationUrl, normaliseBaseUrl, UnsafeDestinationUrlError } from './ssrf';
import { DestinationStoreUnavailableError, getDestinationStore } from './store';
import {
	defaultDestinationSettings,
	type DestinationAdapter,
	type DestinationConnection,
	type DestinationCredentials,
	type DestinationSettings,
	type TaxonomyDiff,
	type WebsiteDestination,
	type WebsiteDestinationView,
} from './types';

export class DestinationError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code: string,
	) {
		super(message);
	}
}

const ENV_KEY = 'folian';

function environmentConnection(): { baseUrl: string; credentials: DestinationCredentials } | null {
	const baseUrl = process.env.FOLIAN_CONTENT_API_URL?.trim();
	const apiKey = process.env.FOLIAN_CONTENT_API_KEY?.trim();
	if (!baseUrl || !apiKey) return null;
	return {
		baseUrl: baseUrl.replace(/\/+$/, ''),
		credentials: { apiKey, bypassToken: process.env.FOLIAN_VERCEL_PROTECTION_BYPASS?.trim() || undefined },
	};
}

async function requireBrand(ownerUserId: string, brandId: string) {
	const brain = await getIntelligenceStore().getBrandBrainById(ownerUserId, brandId);
	if (!brain) throw new DestinationError('Brand not found.', 404, 'brand_not_found');
	return brain;
}

function environmentDestination(ownerUserId: string, brandId: string, id: string): WebsiteDestination {
	const env = environmentConnection();
	const now = new Date().toISOString();
	return {
		id,
		ownerUserId,
		brandId,
		key: ENV_KEY,
		provider: 'payload_content_api',
		name: 'Folian',
		baseUrl: env?.baseUrl ?? null,
		enabled: true,
		credentialSource: 'environment',
		settings: defaultDestinationSettings(),
		taxonomy: null,
		taxonomySyncedAt: null,
		taxonomyDiff: null,
		health: { status: 'unknown', checkedAt: null, message: null, latencyMs: null },
		createdAt: now,
		updatedAt: now,
	};
}

/** Lists a brand's destinations. The Folian destination configured in server environment is recorded on first use. */
export async function listDestinations(ownerUserId: string, brandId: string): Promise<WebsiteDestination[]> {
	await requireBrand(ownerUserId, brandId);
	const store = getDestinationStore();
	const environmentApplies = editorialDestinationForBrand(brandId) === ENV_KEY && Boolean(environmentConnection());
	try {
		const rows = await store.list(ownerUserId, brandId);
		if (environmentApplies && !rows.some((row) => row.key === ENV_KEY)) {
			rows.push(await store.save(environmentDestination(ownerUserId, brandId, crypto.randomUUID())));
		}
		return rows;
	} catch (error) {
		if (error instanceof DestinationStoreUnavailableError) {
			return environmentApplies ? [environmentDestination(ownerUserId, brandId, `env-${ENV_KEY}`)] : [];
		}
		throw error;
	}
}

async function credentialsFor(destination: WebsiteDestination): Promise<DestinationCredentials | null> {
	if (destination.credentialSource === 'environment') {
		return destination.key === ENV_KEY ? environmentConnection()?.credentials ?? null : null;
	}
	if (destination.id.startsWith('env-')) return null;
	const secret = await getDestinationStore().getSecret(destination.id);
	return secret ? decryptCredentials(secret) : null;
}

export async function toView(destination: WebsiteDestination): Promise<WebsiteDestinationView> {
	const provider = providerDefinition(destination.provider);
	let hasCredentials = false;
	try {
		hasCredentials = Boolean((await credentialsFor(destination))?.apiKey);
	} catch {
		hasCredentials = false;
	}
	const { ownerUserId: _owner, ...rest } = destination;
	void _owner;
	return {
		...rest,
		hasCredentials,
		providerLabel: provider?.label ?? destination.provider,
		capabilities: provider?.capabilities ?? PROVIDERS.custom_api.capabilities,
		providerAvailable: Boolean(provider?.available),
	};
}

export function listProviders() {
	return Object.values(PROVIDERS).map((provider) => ({
		id: provider.id,
		label: provider.label,
		available: provider.available,
		note: provider.note,
		capabilities: provider.capabilities,
	}));
}

async function findDestination(ownerUserId: string, brandId: string, keyOrId: string): Promise<WebsiteDestination> {
	const all = await listDestinations(ownerUserId, brandId);
	const destination = all.find((item) => item.key === keyOrId || item.id === keyOrId);
	if (!destination) throw new DestinationError('Destination not found for this brand.', 404, 'destination_not_found');
	return destination;
}

async function findById(ownerUserId: string, id: string): Promise<WebsiteDestination> {
	const destination = id.startsWith('env-') ? null : await getDestinationStore().get(ownerUserId, id);
	if (!destination) throw new DestinationError('Destination not found.', 404, 'destination_not_found');
	await requireBrand(ownerUserId, destination.brandId);
	return destination;
}

export async function resolveConnection(
	ownerUserId: string,
	brandId: string,
	keyOrId: string,
): Promise<{ destination: WebsiteDestination; adapter: DestinationAdapter; connection: DestinationConnection }> {
	const destination = await findDestination(ownerUserId, brandId, keyOrId);
	return connectionFor(destination);
}

async function connectionFor(destination: WebsiteDestination) {
	if (!destination.enabled) throw new DestinationError(`${destination.name} is disabled. Enable it in Websites & CMS.`, 409, 'destination_disabled');
	const provider = providerDefinition(destination.provider);
	if (!provider?.adapter) throw new DestinationError(`${provider?.label ?? destination.provider} is not available yet.`, 422, 'provider_unavailable');
	if (!destination.baseUrl) throw new DestinationError('This destination has no CMS URL.', 422, 'destination_incomplete');
	const credentials = await credentialsFor(destination);
	if (!credentials?.apiKey) throw new DestinationError('This destination has no API key. Add one in Websites & CMS.', 422, 'credentials_missing');
	return { destination, adapter: provider.adapter, connection: { destination, baseUrl: destination.baseUrl, credentials } };
}

function slugKey(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'website';
}

export type DestinationInput = {
	brandId: string;
	name: string;
	provider: string;
	baseUrl: string;
	apiKey: string;
	bypassToken?: string;
};

export async function createDestination(ownerUserId: string, input: DestinationInput): Promise<WebsiteDestination> {
	await requireBrand(ownerUserId, input.brandId);
	const provider = providerDefinition(input.provider);
	if (!provider) throw new DestinationError('Choose a CMS provider.', 400, 'invalid_provider');
	if (!provider.available) throw new DestinationError(`${provider.label} is not available yet.`, 422, 'provider_unavailable');
	if (!input.name.trim()) throw new DestinationError('Name the destination.', 400, 'invalid_input');
	if (!input.apiKey.trim()) throw new DestinationError('Add the CMS API key.', 400, 'invalid_input');
	let baseUrl: string;
	try {
		baseUrl = normaliseBaseUrl((await assertSafeDestinationUrl(input.baseUrl.trim())).toString());
	} catch (error) {
		throw new DestinationError(error instanceof Error ? error.message : 'Invalid URL.', 400, 'unsafe_url');
	}
	const existing = await listDestinations(ownerUserId, input.brandId);
	let key = slugKey(input.name);
	for (let index = 2; existing.some((item) => item.key === key); index += 1) key = `${slugKey(input.name)}-${index}`;
	const now = new Date().toISOString();
	const store = getDestinationStore();
	const saved = await store.save({
		id: crypto.randomUUID(),
		ownerUserId,
		brandId: input.brandId,
		key,
		provider: provider.id,
		name: input.name.trim(),
		baseUrl,
		enabled: true,
		credentialSource: 'stored',
		settings: defaultDestinationSettings(),
		taxonomy: null,
		taxonomySyncedAt: null,
		taxonomyDiff: null,
		health: { status: 'unknown', checkedAt: null, message: null, latencyMs: null },
		createdAt: now,
		updatedAt: now,
	});
	await store.saveSecret(saved.id, encryptCredentials({ apiKey: input.apiKey.trim(), bypassToken: input.bypassToken?.trim() || undefined }));
	return saved;
}

const FIELD_KEYS = ['title', 'dek', 'body', 'category', 'tags', 'seoTitle', 'seoDescription', 'author', 'heroImage'];

function validateSettings(current: DestinationSettings, patch: Partial<DestinationSettings>, taxonomy: DestinationTaxonomy | null): DestinationSettings {
	const next: DestinationSettings = { ...current, ...patch, allowPublish: false };
	const categoryIds = new Set(taxonomy?.categories.map((category) => category.id) ?? []);
	if (patch.defaultCategoryId !== undefined) {
		const value = patch.defaultCategoryId?.trim() || null;
		if (value && taxonomy && !categoryIds.has(value)) throw new DestinationError('The default category must be one the CMS returned.', 400, 'invalid_category');
		next.defaultCategoryId = value;
	}
	if (patch.topicMappings) {
		next.topicMappings = patch.topicMappings
			.map((mapping) => ({ topic: String(mapping.topic ?? '').trim(), categoryId: String(mapping.categoryId ?? '').trim() }))
			.filter((mapping) => mapping.topic && mapping.categoryId)
			.slice(0, 100);
		const unknown = next.topicMappings.find((mapping) => taxonomy && !categoryIds.has(mapping.categoryId));
		if (unknown) throw new DestinationError(`“${unknown.categoryId}” is not a category in the CMS.`, 400, 'invalid_category');
	}
	if (patch.fieldMappings) {
		next.fieldMappings = Object.fromEntries(
			Object.entries(patch.fieldMappings)
				.filter(([field, target]) => FIELD_KEYS.includes(field) && typeof target === 'string' && /^[A-Za-z0-9_.-]{1,60}$/.test(target))
				.map(([field, target]) => [field, target]),
		);
	}
	if (patch.seo) {
		const max = Number(patch.seo.descriptionMaxLength ?? current.seo.descriptionMaxLength);
		next.seo = {
			titleTemplate: String(patch.seo.titleTemplate ?? current.seo.titleTemplate).slice(0, 120) || '{title}',
			descriptionMaxLength: Number.isFinite(max) ? Math.min(320, Math.max(50, Math.round(max))) : current.seo.descriptionMaxLength,
		};
	}
	if (patch.media) {
		next.media = {
			delivery: patch.media.delivery === 'url' ? 'url' : 'upload',
			maxBytes: Math.min(20 * 1024 * 1024, Math.max(256 * 1024, Number(patch.media.maxBytes ?? current.media.maxBytes))),
			allowedImageHosts: (patch.media.allowedImageHosts ?? current.media.allowedImageHosts)
				.map((host) => String(host).trim().toLowerCase())
				.filter((host) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host))
				.slice(0, 10),
		};
	}
	if (patch.defaultAuthor !== undefined) next.defaultAuthor = String(patch.defaultAuthor).slice(0, 120);
	return next;
}

export type DestinationPatch = {
	name?: string;
	baseUrl?: string;
	enabled?: boolean;
	apiKey?: string;
	bypassToken?: string;
	settings?: Partial<DestinationSettings>;
};

export async function updateDestination(ownerUserId: string, id: string, patch: DestinationPatch): Promise<WebsiteDestination> {
	const destination = await findById(ownerUserId, id);
	const store = getDestinationStore();
	if (destination.credentialSource === 'environment' && (patch.baseUrl !== undefined || patch.apiKey !== undefined || patch.bypassToken !== undefined)) {
		throw new DestinationError('This destination uses server environment credentials. Its URL and key are changed in the deployment settings.', 400, 'environment_managed');
	}
	if (patch.name !== undefined) {
		if (!patch.name.trim()) throw new DestinationError('Name the destination.', 400, 'invalid_input');
		destination.name = patch.name.trim().slice(0, 80);
	}
	if (patch.baseUrl !== undefined) {
		try {
			destination.baseUrl = normaliseBaseUrl((await assertSafeDestinationUrl(patch.baseUrl.trim())).toString());
		} catch (error) {
			throw new DestinationError(error instanceof UnsafeDestinationUrlError ? error.message : 'Invalid URL.', 400, 'unsafe_url');
		}
		destination.health = { status: 'unknown', checkedAt: null, message: 'URL changed. Test the connection.', latencyMs: null };
	}
	if (patch.enabled !== undefined) {
		destination.enabled = patch.enabled;
		if (!patch.enabled) destination.health = { ...destination.health, status: 'disabled', message: 'Disabled. Articles cannot be sent here.' };
		else if (destination.health.status === 'disabled') destination.health = { ...destination.health, status: 'unknown', message: null };
	}
	if (patch.settings) destination.settings = validateSettings(destination.settings, patch.settings, destination.taxonomy);
	destination.updatedAt = new Date().toISOString();
	const saved = await store.save(destination);
	if (patch.apiKey !== undefined || patch.bypassToken !== undefined) {
		const current = (await credentialsFor(destination)) ?? {};
		const apiKey = patch.apiKey?.trim() || current.apiKey;
		if (!apiKey) throw new DestinationError('Add the CMS API key.', 400, 'invalid_input');
		await store.saveSecret(destination.id, encryptCredentials({ apiKey, bypassToken: patch.bypassToken !== undefined ? patch.bypassToken.trim() || undefined : current.bypassToken }));
	}
	return saved;
}

export async function testDestination(ownerUserId: string, id: string): Promise<WebsiteDestination> {
	const destination = await findById(ownerUserId, id);
	const { adapter, connection } = await connectionFor(destination);
	const result = await adapter.testConnection(connection);
	destination.health = {
		status: result.ok ? 'healthy' : 'error',
		checkedAt: new Date().toISOString(),
		message: result.message,
		latencyMs: result.latencyMs,
	};
	destination.updatedAt = new Date().toISOString();
	return getDestinationStore().save(destination);
}

export function diffTaxonomy(previous: DestinationTaxonomy | null, next: DestinationTaxonomy, settings: DestinationSettings): TaxonomyDiff {
	const before = new Map((previous?.categories ?? []).map((category) => [category.id, category.name]));
	const after = new Map(next.categories.map((category) => [category.id, category.name]));
	return {
		added: previous ? next.categories.filter((category) => !before.has(category.id)).map(({ id, name }) => ({ id, name })) : [],
		removed: [...before.entries()].filter(([id]) => !after.has(id)).map(([id, name]) => ({ id, name })),
		renamed: [...after.entries()].filter(([id, name]) => before.has(id) && before.get(id) !== name).map(([id, name]) => ({ id, from: before.get(id) as string, to: name })),
		unmappedTopics: settings.topicMappings.filter((mapping) => !after.has(mapping.categoryId)).map((mapping) => mapping.topic),
		missingDefault: Boolean(settings.defaultCategoryId && !after.has(settings.defaultCategoryId)),
		checkedAt: new Date().toISOString(),
	};
}

export async function syncDestinationTaxonomy(ownerUserId: string, id: string): Promise<WebsiteDestination> {
	const destination = await findById(ownerUserId, id);
	const { adapter, connection } = await connectionFor(destination);
	const started = Date.now();
	try {
		const taxonomy = await adapter.fetchTaxonomy(connection);
		destination.taxonomyDiff = diffTaxonomy(destination.taxonomy, taxonomy, destination.settings);
		destination.taxonomy = taxonomy;
		destination.taxonomySyncedAt = new Date().toISOString();
		destination.health = {
			status: destination.taxonomyDiff.missingDefault || destination.taxonomyDiff.unmappedTopics.length ? 'degraded' : 'healthy',
			checkedAt: destination.taxonomySyncedAt,
			message: `Taxonomy synced: ${taxonomy.categories.length} categories.`,
			latencyMs: Date.now() - started,
		};
	} catch (error) {
		destination.health = {
			status: 'error',
			checkedAt: new Date().toISOString(),
			message: error instanceof Error ? error.message : 'Taxonomy sync failed.',
			latencyMs: Date.now() - started,
		};
	}
	destination.updatedAt = new Date().toISOString();
	return getDestinationStore().save(destination);
}

/** Taxonomy for a brand destination: the last synced copy, or a live fetch that is then stored. */
export async function destinationTaxonomy(ownerUserId: string, brandId: string, keyOrId: string): Promise<DestinationTaxonomy | null> {
	const destination = await findDestination(ownerUserId, brandId, keyOrId);
	if (destination.taxonomy) return destination.taxonomy;
	if (destination.id.startsWith('env-')) {
		const { adapter, connection } = await connectionFor(destination);
		return adapter.fetchTaxonomy(connection).catch(() => null);
	}
	const synced = await syncDestinationTaxonomy(ownerUserId, destination.id).catch(() => null);
	return synced?.taxonomy ?? null;
}

export async function destinationForBrand(ownerUserId: string, brandId: string, keyOrId: string): Promise<WebsiteDestination> {
	return findDestination(ownerUserId, brandId, keyOrId);
}

export function categoryFromMappings(settings: DestinationSettings, text: string): { categoryId: string; topic: string } | null {
	const haystack = text.toLowerCase();
	const match = settings.topicMappings.find((mapping) => haystack.includes(mapping.topic.toLowerCase()));
	return match ? { categoryId: match.categoryId, topic: match.topic } : null;
}
