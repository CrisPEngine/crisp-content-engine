import 'server-only';

import { listRecords } from '@/lib/airtable/client';
import { getBrandProfileField, readBrandProfileRecord } from '@/lib/airtable/readBrandProfileRecord';
import { SidecarError } from './errors';

/** Same ownership field as `/api/brands` and onboarding. */
export const BRAND_OWNER_FIELD_NAME = 'user_id';

export type BrandAccessMode = 'user_id' | 'allowlist_only';

export type BrandAccessPolicy = {
	mode: BrandAccessMode;
	ownerUserId: string;
	/** Trimmed original names from env (for Airtable formulas). */
	allowlistNames: string[];
	/** Lowercase trimmed names for post-fetch checks. */
	allowlistNormalized: Set<string> | null;
};

export type ParsedAllowlist = {
	names: string[];
	normalized: Set<string> | null;
};

let cachedUserIdFieldWorks: boolean | undefined;

function requireBrandProfilesTable(): string {
	const table = process.env.AIRTABLE_BRANDPROFILES_TABLE;
	if (!table?.trim()) {
		throw new SidecarError('AIRTABLE_BRANDPROFILES_TABLE is not configured', {
			status: 500,
			code: 'sidecar_missing_env',
			details: { env: 'AIRTABLE_BRANDPROFILES_TABLE' },
		});
	}
	return table;
}

function escapeFormulaString(value: string): string {
	return value.replace(/"/g, '""');
}

export function parseBrandAllowlist(): ParsedAllowlist {
	const raw = process.env.SIDECAR_BRAND_ALLOWLIST;
	if (!raw?.trim()) {
		return { names: [], normalized: null };
	}
	const names = raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	return {
		names,
		normalized: new Set(names.map((n) => n.toLowerCase())),
	};
}

function isUnknownUserIdFieldError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const message = error.message;
	return (
		message.includes('UNKNOWN_FIELD_NAME') &&
		(message.includes('user_id') || message.includes(BRAND_OWNER_FIELD_NAME))
	);
}

/**
 * Probe once per process: does BrandProfiles expose {user_id} for filter formulas?
 */
export async function probeBrandOwnerFieldAvailable(
	table: string,
	ownerUserId: string,
): Promise<boolean> {
	if (process.env.SIDECAR_BRAND_USER_ID_FIELD === 'false') {
		cachedUserIdFieldWorks = false;
		return false;
	}
	if (cachedUserIdFieldWorks !== undefined) {
		return cachedUserIdFieldWorks;
	}

	try {
		await listRecords({
			table,
			fields: ['client_name', BRAND_OWNER_FIELD_NAME],
			filterByFormula: `{${BRAND_OWNER_FIELD_NAME}} = "${escapeFormulaString(ownerUserId)}"`,
			maxRecords: 1,
			cache: false,
			returnFieldsByFieldId: true,
			endpoint: '/api/sidecar/brand-access-probe',
		});
		cachedUserIdFieldWorks = true;
	} catch (error) {
		if (isUnknownUserIdFieldError(error)) {
			cachedUserIdFieldWorks = false;
		} else {
			throw error;
		}
	}

	return cachedUserIdFieldWorks;
}

export function buildAllowlistFilterFormula(allowlistNames: string[]): string {
	if (allowlistNames.length === 0) {
		return 'FALSE()';
	}
	const parts = allowlistNames.map((name) => {
		const lower = escapeFormulaString(name.toLowerCase());
		return `LOWER({client_name})="${lower}"`;
	});
	return parts.length === 1 ? parts[0]! : `OR(${parts.join(',')})`;
}

export function buildBrandListFilterFormula(policy: BrandAccessPolicy): string {
	const ownerClause = `{${BRAND_OWNER_FIELD_NAME}} = "${escapeFormulaString(policy.ownerUserId)}"`;
	if (policy.mode === 'user_id') {
		if (policy.allowlistNames.length > 0) {
			return `AND(${ownerClause}, ${buildAllowlistFilterFormula(policy.allowlistNames)})`;
		}
		return ownerClause;
	}
	return buildAllowlistFilterFormula(policy.allowlistNames);
}

/**
 * Resolve how Sidecar may read BrandProfiles. Never returns an "all brands" mode.
 */
export async function resolveBrandAccessPolicy(ownerUserId: string): Promise<BrandAccessPolicy> {
	const table = requireBrandProfilesTable();
	const allowlist = parseBrandAllowlist();
	const userIdFieldWorks = await probeBrandOwnerFieldAvailable(table, ownerUserId);

	if (userIdFieldWorks) {
		return {
			mode: 'user_id',
			ownerUserId,
			allowlistNames: allowlist.names,
			allowlistNormalized: allowlist.normalized,
		};
	}

	if (allowlist.names.length === 0) {
		throw new SidecarError(
			'Sidecar brand access is not configured. Set SIDECAR_BRAND_ALLOWLIST or add user_id to BrandProfiles.',
			{
				status: 503,
				code: 'sidecar_brand_access_not_configured',
				details: {
					hint: 'Comma-separated client_name values, e.g. SIDECAR_BRAND_ALLOWLIST=CrisP Digital,My Brand',
				},
			},
		);
	}

	return {
		mode: 'allowlist_only',
		ownerUserId,
		allowlistNames: allowlist.names,
		allowlistNormalized: allowlist.normalized,
	};
}

export function brandNameAllowedByPolicy(policy: BrandAccessPolicy, clientName: string): boolean {
	const normalized = clientName.trim().toLowerCase();
	if (!normalized) return false;
	if (policy.allowlistNormalized && !policy.allowlistNormalized.has(normalized)) {
		return false;
	}
	return true;
}

export function recordOwnerUserId(fields: Record<string, unknown>): string {
	const value = getBrandProfileField(fields, BRAND_OWNER_FIELD_NAME);
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value.trim();
	return String(value).trim();
}

/**
 * Server-side check after Airtable fetch (defense in depth for get-by-id).
 */
export function assertRecordAccessible(
	policy: BrandAccessPolicy,
	record: { id: string; fields?: Record<string, unknown> },
): void {
	const fields = (record.fields || {}) as Record<string, unknown>;
	const parsed = readBrandProfileRecord(record);
	const name = parsed.client_name.trim();

	if (!name || !brandNameAllowedByPolicy(policy, name)) {
		throw new SidecarError('Brand is not enabled for Sidecar', {
			status: 403,
			code: 'sidecar_brand_not_allowed',
		});
	}

	if (policy.mode === 'user_id') {
		const ownerId = recordOwnerUserId(fields);
		if (ownerId !== policy.ownerUserId) {
			throw new SidecarError('Brand access denied', {
				status: 403,
				code: 'sidecar_brand_forbidden',
			});
		}
	}
}

export function filterRecordsToAccessibleBrands<T extends { id: string; fields?: Record<string, unknown> }>(
	policy: BrandAccessPolicy,
	records: T[],
): T[] {
	return records.filter((record) => {
		try {
			assertRecordAccessible(policy, record);
			return true;
		} catch {
			return false;
		}
	});
}

/** Reset probe cache (tests only). */
export function resetBrandAccessProbeCache(): void {
	cachedUserIdFieldWorks = undefined;
}
