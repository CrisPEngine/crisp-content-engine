import 'server-only';

import { getRecord, listRecords } from '@/lib/airtable/client';
import { SidecarError } from './errors';

const BRAND_VOICE_FIELDS = [
	'client_name',
	'brand_type',
	'website',
	'audience',
	'value_props',
	'offers',
	'brand_goals',
	'voice_rules',
	'brand_keywords',
	'exclude_keywords',
	'content_rules',
	'additional_info',
	'platforms_requested',
	'timezone',
	'language_region',
	'approval_contact_email',
	'user_id',
	'status',
	'personal_full_name',
	'personal_headline',
	'personal_audience',
	'personal_expertise',
	'personal_goals',
	'personal_voice_traits',
	'personal_tone_avoid',
	'personal_content_style',
	'personal_exclude_keywords',
	'personal_story',
] as const;

export type SidecarBrandSummary = {
	id: string;
	name: string;
	status: string;
	brand_type?: string;
	platforms_requested?: string[];
};

export type SidecarBrandProfile = SidecarBrandSummary & {
	fields: Record<string, unknown>;
};

export type SidecarBrandsMeta = {
	airtableCount: number;
	returnedCount: number;
	allowlistActive: boolean;
	userFilterActive: boolean;
	emptyReason?: string;
};

export type SidecarBrandsResult = {
	brands: SidecarBrandSummary[];
	meta: SidecarBrandsMeta;
};

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new SidecarError(`${name} is not configured`, {
			status: 500,
			code: 'sidecar_missing_env',
			details: { env: name },
		});
	}
	return value;
}

/** Only filter when SIDECAR_BRAND_ALLOWLIST is explicitly set (trimmed, case-insensitive). */
function parseBrandAllowlist(): Set<string> | null {
	const raw = process.env.SIDECAR_BRAND_ALLOWLIST;
	if (!raw?.trim()) return null;
	return new Set(
		raw
			.split(',')
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean),
	);
}

function shouldFilterByUserId(): boolean {
	return process.env.SIDECAR_FILTER_BRANDS_BY_USER_ID === 'true';
}

function fieldString(fields: Record<string, unknown>, key: string): string {
	const value = fields[key];
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return value.map(String).join(', ');
	return String(value);
}

function mapBrandRecord(record: { id: string; fields?: Record<string, unknown> }): SidecarBrandSummary {
	const fields = (record.fields || {}) as Record<string, unknown>;
	return {
		id: record.id,
		name: fieldString(fields, 'client_name'),
		status: fieldString(fields, 'status') || 'New Brief',
		brand_type: fieldString(fields, 'brand_type') || undefined,
		platforms_requested: Array.isArray(fields.platforms_requested)
			? (fields.platforms_requested as string[])
			: [],
	};
}

function buildEmptyReason(options: {
	airtableCount: number;
	namedCount: number;
	returnedCount: number;
	allowlistActive: boolean;
	userFilterActive: boolean;
}): string | undefined {
	if (options.returnedCount > 0) return undefined;
	if (options.airtableCount === 0) {
		if (options.userFilterActive) {
			return 'No BrandProfiles matched SIDECAR_FILTER_BRANDS_BY_USER_ID. Clear that flag or check user_id on Airtable records.';
		}
		return 'No BrandProfiles records found in Airtable.';
	}
	if (options.namedCount === 0) {
		return 'BrandProfiles records exist but none have client_name populated.';
	}
	if (options.allowlistActive) {
		return 'No brands matched SIDECAR_BRAND_ALLOWLIST (matching is trimmed and case-insensitive).';
	}
	return 'No brands available after filtering.';
}

/**
 * List brands for Sidecar. SIDECAR_OWNER_USER_ID is for Supabase writes only unless
 * SIDECAR_FILTER_BRANDS_BY_USER_ID=true.
 */
export async function listSidecarBrands(ownerUserId: string): Promise<SidecarBrandsResult> {
	const table = requireEnv('AIRTABLE_BRANDPROFILES_TABLE');
	const allowlist = parseBrandAllowlist();
	const userFilterActive = shouldFilterByUserId();

	const listOptions = {
		table,
		fields: ['client_name', 'status', 'brand_type', 'platforms_requested'],
		cache: false as const,
		endpoint: '/api/sidecar/brands',
		sort: [{ field: 'client_name', direction: 'asc' as const }],
	};

	let records: Array<{ id: string; fields?: Record<string, unknown> }>;
	try {
		records = await listRecords({
			...listOptions,
			...(userFilterActive
				? { filterByFormula: `{user_id} = "${ownerUserId}"` }
				: {}),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (userFilterActive && message.includes('UNKNOWN_FIELD_NAME')) {
			console.warn('[Sidecar brands] user_id field missing — listing all BrandProfiles');
			records = await listRecords(listOptions);
		} else {
			throw error;
		}
	}

	const mapped = records.map(mapBrandRecord);
	const withNames = mapped.filter((b) => b.name.trim());
	const filtered = allowlist
		? withNames.filter((b) => allowlist.has(b.name.trim().toLowerCase()))
		: withNames;

	const meta: SidecarBrandsMeta = {
		airtableCount: records.length,
		returnedCount: filtered.length,
		allowlistActive: allowlist !== null,
		userFilterActive,
		emptyReason: buildEmptyReason({
			airtableCount: records.length,
			namedCount: withNames.length,
			returnedCount: filtered.length,
			allowlistActive: allowlist !== null,
			userFilterActive,
		}),
	};

	console.log('[Sidecar brands]', {
		airtableCount: meta.airtableCount,
		returnedCount: meta.returnedCount,
		allowlistActive: meta.allowlistActive,
		userFilterActive: meta.userFilterActive,
	});

	return { brands: filtered, meta };
}

export async function resolveBrandProfile(options: {
	ownerUserId: string;
	brandId?: string;
	brandName?: string;
}): Promise<SidecarBrandProfile> {
	const table = requireEnv('AIRTABLE_BRANDPROFILES_TABLE');
	const userFilterActive = shouldFilterByUserId();

	let record: { id: string; fields: Record<string, unknown> } | null = null;

	if (options.brandId) {
		const fetched = await getRecord({
			table,
			recordId: options.brandId,
			fields: [...BRAND_VOICE_FIELDS],
		});
		record = { id: fetched.id, fields: (fetched.fields || {}) as Record<string, unknown> };
	} else if (options.brandName) {
		const escaped = options.brandName.replace(/"/g, '""');
		const formula = userFilterActive
			? `AND({user_id} = "${options.ownerUserId}", {client_name} = "${escaped}")`
			: `{client_name} = "${escaped}"`;
		const records = await listRecords({
			table,
			filterByFormula: formula,
			fields: [...BRAND_VOICE_FIELDS],
			maxRecords: 1,
			cache: false,
			endpoint: '/api/sidecar/draft',
		});
		if (records[0]) {
			record = { id: records[0].id, fields: (records[0].fields || {}) as Record<string, unknown> };
		}
	}

	if (!record) {
		throw new SidecarError('Brand not found', { status: 404, code: 'sidecar_brand_not_found' });
	}

	if (userFilterActive) {
		const userId = fieldString(record.fields, 'user_id');
		if (userId && userId !== options.ownerUserId) {
			throw new SidecarError('Brand access denied', { status: 403, code: 'sidecar_brand_forbidden' });
		}
	}

	const name = fieldString(record.fields, 'client_name');
	const allowlist = parseBrandAllowlist();
	if (allowlist && name && !allowlist.has(name.trim().toLowerCase())) {
		throw new SidecarError('Brand is not enabled for Sidecar', {
			status: 403,
			code: 'sidecar_brand_not_allowed',
		});
	}

	return {
		id: record.id,
		name,
		status: fieldString(record.fields, 'status'),
		brand_type: fieldString(record.fields, 'brand_type') || undefined,
		fields: record.fields,
	};
}

export function buildBrandVoiceContext(profile: SidecarBrandProfile): string {
	const f = profile.fields;
	const isPersonal = fieldString(f, 'brand_type') === 'personal';

	const sections: string[] = [
		`Brand: ${profile.name}`,
		`Type: ${fieldString(f, 'brand_type') || 'company'}`,
	];

	if (isPersonal) {
		const personalFields: Array<[string, string]> = [
			['personal_full_name', 'Name'],
			['personal_headline', 'Headline'],
			['personal_audience', 'Audience'],
			['personal_expertise', 'Expertise'],
			['personal_goals', 'Goals'],
			['personal_voice_traits', 'Voice traits'],
			['personal_tone_avoid', 'Tone to avoid'],
			['personal_content_style', 'Content style'],
			['personal_exclude_keywords', 'Exclude keywords'],
			['personal_story', 'Story'],
		];
		for (const [key, label] of personalFields) {
			const value = fieldString(f, key);
			if (value) sections.push(`${label}: ${value}`);
		}
	} else {
		const companyFields: Array<[string, string]> = [
			['audience', 'Audience'],
			['value_props', 'Value propositions'],
			['offers', 'Offers'],
			['brand_goals', 'Brand goals'],
			['voice_rules', 'Voice rules'],
			['content_rules', 'Content rules'],
			['brand_keywords', 'Keywords'],
			['exclude_keywords', 'Exclude keywords'],
			['additional_info', 'Additional context'],
		];
		for (const [key, label] of companyFields) {
			const value = fieldString(f, key);
			if (value) sections.push(`${label}: ${value}`);
		}
	}

	const language = fieldString(f, 'language_region');
	if (language) sections.push(`Language region: ${language}`);

	return sections.join('\n');
}
