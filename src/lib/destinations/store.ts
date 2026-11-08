import 'server-only';

import { getSupabaseService } from '@/lib/supabaseService';
import { defaultDestinationSettings, type DestinationHealth, type WebsiteDestination } from './types';

export type DestinationStore = {
	list(ownerUserId: string, brandId?: string): Promise<WebsiteDestination[]>;
	get(ownerUserId: string, id: string): Promise<WebsiteDestination | null>;
	getByKey(ownerUserId: string, brandId: string, key: string): Promise<WebsiteDestination | null>;
	save(destination: WebsiteDestination): Promise<WebsiteDestination>;
	getSecret(destinationId: string): Promise<string | null>;
	saveSecret(destinationId: string, ciphertext: string): Promise<void>;
};

export class DestinationStoreUnavailableError extends Error {}

type Row = {
	id: string;
	owner_user_id: string;
	brand_id: string;
	destination_key: string;
	provider: string;
	name: string;
	base_url: string | null;
	enabled: boolean;
	credential_source: 'stored' | 'environment';
	settings: Record<string, unknown> | null;
	taxonomy: WebsiteDestination['taxonomy'];
	taxonomy_synced_at: string | null;
	health: Partial<DestinationHealth> & { taxonomyDiff?: WebsiteDestination['taxonomyDiff'] } | null;
	created_at: string;
	updated_at: string;
};

function fromRow(row: Row): WebsiteDestination {
	const defaults = defaultDestinationSettings();
	const settings = { ...defaults, ...(row.settings ?? {}) } as WebsiteDestination['settings'];
	settings.allowPublish = false;
	return {
		id: row.id,
		ownerUserId: row.owner_user_id,
		brandId: row.brand_id,
		key: row.destination_key,
		provider: row.provider as WebsiteDestination['provider'],
		name: row.name,
		baseUrl: row.base_url,
		enabled: row.enabled,
		credentialSource: row.credential_source,
		settings,
		taxonomy: row.taxonomy,
		taxonomySyncedAt: row.taxonomy_synced_at,
		taxonomyDiff: row.health?.taxonomyDiff ?? null,
		health: {
			status: row.health?.status ?? 'unknown',
			checkedAt: row.health?.checkedAt ?? null,
			message: row.health?.message ?? null,
			latencyMs: row.health?.latencyMs ?? null,
		},
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toRow(destination: WebsiteDestination): Row {
	return {
		id: destination.id,
		owner_user_id: destination.ownerUserId,
		brand_id: destination.brandId,
		destination_key: destination.key,
		provider: destination.provider,
		name: destination.name,
		base_url: destination.baseUrl,
		enabled: destination.enabled,
		credential_source: destination.credentialSource,
		settings: { ...destination.settings, allowPublish: false },
		taxonomy: destination.taxonomy,
		taxonomy_synced_at: destination.taxonomySyncedAt,
		health: { ...destination.health, taxonomyDiff: destination.taxonomyDiff ?? null },
		created_at: destination.createdAt,
		updated_at: destination.updatedAt,
	};
}

function missingTable(error: { code?: string; message?: string }): boolean {
	return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message ?? '');
}

function supabaseStore(): DestinationStore {
	const db = () => getSupabaseService();
	const fail = (error: { code?: string; message?: string }): never => {
		if (missingTable(error)) throw new DestinationStoreUnavailableError('Website destinations need migration 039.');
		throw new Error(error.message ?? 'Destination store error');
	};
	return {
		async list(ownerUserId, brandId) {
			let query = db().from('website_destinations').select('*').eq('owner_user_id', ownerUserId);
			if (brandId) query = query.eq('brand_id', brandId);
			const { data, error } = await query.order('created_at', { ascending: true });
			if (error) fail(error);
			return ((data ?? []) as Row[]).map(fromRow);
		},
		async get(ownerUserId, id) {
			const { data, error } = await db().from('website_destinations').select('*').eq('owner_user_id', ownerUserId).eq('id', id).maybeSingle();
			if (error) fail(error);
			return data ? fromRow(data as Row) : null;
		},
		async getByKey(ownerUserId, brandId, key) {
			const { data, error } = await db()
				.from('website_destinations')
				.select('*')
				.eq('owner_user_id', ownerUserId)
				.eq('brand_id', brandId)
				.eq('destination_key', key)
				.maybeSingle();
			if (error) fail(error);
			return data ? fromRow(data as Row) : null;
		},
		async save(destination) {
			const { data, error } = await db().from('website_destinations').upsert(toRow(destination), { onConflict: 'id' }).select('*').single();
			if (error) fail(error);
			return fromRow(data as Row);
		},
		async getSecret(destinationId) {
			const { data, error } = await db().from('website_destination_secrets').select('credentials_encrypted').eq('destination_id', destinationId).maybeSingle();
			if (error) fail(error);
			return (data?.credentials_encrypted as string | undefined) ?? null;
		},
		async saveSecret(destinationId, ciphertext) {
			const { error } = await db()
				.from('website_destination_secrets')
				.upsert({ destination_id: destinationId, credentials_encrypted: ciphertext, updated_at: new Date().toISOString() }, { onConflict: 'destination_id' });
			if (error) fail(error);
		},
	};
}

export function createMemoryDestinationStore(): DestinationStore {
	const rows = new Map<string, WebsiteDestination>();
	const secrets = new Map<string, string>();
	return {
		async list(ownerUserId, brandId) {
			return [...rows.values()].filter((row) => row.ownerUserId === ownerUserId && (!brandId || row.brandId === brandId)).map((row) => structuredClone(row));
		},
		async get(ownerUserId, id) {
			const row = rows.get(id);
			return row && row.ownerUserId === ownerUserId ? structuredClone(row) : null;
		},
		async getByKey(ownerUserId, brandId, key) {
			const row = [...rows.values()].find((item) => item.ownerUserId === ownerUserId && item.brandId === brandId && item.key === key);
			return row ? structuredClone(row) : null;
		},
		async save(destination) {
			const clash = [...rows.values()].find(
				(item) => item.id !== destination.id && item.ownerUserId === destination.ownerUserId && item.brandId === destination.brandId && item.key === destination.key,
			);
			if (clash) throw new Error('A destination with that key already exists for this brand.');
			rows.set(destination.id, structuredClone({ ...destination, settings: { ...destination.settings, allowPublish: false } }));
			return structuredClone(destination);
		},
		async getSecret(destinationId) {
			return secrets.get(destinationId) ?? null;
		},
		async saveSecret(destinationId, ciphertext) {
			secrets.set(destinationId, ciphertext);
		},
	};
}

let override: DestinationStore | null = null;
let memory: DestinationStore | null = null;

export function setDestinationStoreForTests(store: DestinationStore | null): void {
	override = store;
}

export function getDestinationStore(): DestinationStore {
	if (override) return override;
	if (process.env.VITEST === 'true') {
		memory ??= createMemoryDestinationStore();
		return memory;
	}
	return supabaseStore();
}
