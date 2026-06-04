import 'server-only';

import { listRecords } from '@/lib/airtable/client';
import {
	getBrandProfileField,
	logBrandProfilesFetchDiagnostics,
	readBrandProfileRecord,
} from '@/lib/airtable/readBrandProfileRecord';
import {
	assertRecordAccessible,
	BRAND_OWNER_FIELD_NAME,
	buildBrandListFilterFormula,
	type BrandAccessPolicy,
	resolveBrandAccessPolicy,
} from './brandAccess';
import {
	fetchBrandProfileByName,
	fetchBrandProfileRecordById,
	parseBrandProfileFromFields,
} from './brandProfileFetch';
import { SidecarError } from './errors';

const SIDECAR_LIST_FIELD_NAMES = [
	'client_name',
	'status',
	'brand_type',
	'platforms_requested',
	BRAND_OWNER_FIELD_NAME,
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
	accessMode: BrandAccessPolicy['mode'];
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

function fieldString(fields: Record<string, unknown>, key: string): string {
	const value = getBrandProfileField(fields, key);
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return value.map(String).join(', ');
	return String(value);
}

function mapBrandRecord(record: { id: string; fields?: Record<string, unknown> }): SidecarBrandSummary {
	const parsed = readBrandProfileRecord(record);
	return {
		id: parsed.id,
		name: parsed.client_name,
		status: parsed.status,
		brand_type: parsed.brand_type,
		platforms_requested: parsed.platforms_requested,
	};
}

function buildEmptyReason(options: {
	airtableCount: number;
	namedCount: number;
	returnedCount: number;
	policy: BrandAccessPolicy;
}): string | undefined {
	if (options.returnedCount > 0) return undefined;
	if (options.airtableCount === 0) {
		if (options.policy.mode === 'user_id') {
			return `No BrandProfiles found for ${BRAND_OWNER_FIELD_NAME}=${options.policy.ownerUserId}.`;
		}
		return 'No BrandProfiles matched SIDECAR_BRAND_ALLOWLIST.';
	}
	if (options.namedCount === 0) {
		return 'BrandProfiles records exist but client_name could not be read. Check Airtable field IDs vs names.';
	}
	if (options.policy.allowlistNames.length > 0) {
		return 'No brands matched your access rules and SIDECAR_BRAND_ALLOWLIST.';
	}
	return 'No brands available for this Sidecar owner.';
}

/**
 * List BrandProfiles visible to SIDECAR_OWNER_USER_ID. Never returns the full Airtable table.
 */
export async function listSidecarBrands(ownerUserId: string): Promise<SidecarBrandsResult> {
	const table = requireEnv('AIRTABLE_BRANDPROFILES_TABLE');
	const policy = await resolveBrandAccessPolicy(ownerUserId);
	const filterByFormula = buildBrandListFilterFormula(policy);

	const listFields =
		policy.mode === 'user_id'
			? [...SIDECAR_LIST_FIELD_NAMES]
			: (['client_name', 'status', 'brand_type', 'platforms_requested'] as const);

	const listOptions = {
		table,
		fields: [...listFields],
		cache: false as const,
		endpoint: '/api/sidecar/brands',
		sort: [{ field: 'client_name', direction: 'asc' as const }],
		returnFieldsByFieldId: true as const,
		filterByFormula,
	};

	const records = await listRecords(listOptions);
	const accessible = records.filter((record) => {
		try {
			assertRecordAccessible(policy, record);
			return true;
		} catch {
			return false;
		}
	});

	const mapped = accessible.map(mapBrandRecord).filter((b) => b.name.trim());

	logBrandProfilesFetchDiagnostics({
		endpoint: 'Sidecar brands',
		recordCount: records.length,
		mappedCount: mapped.length,
		firstRecord: accessible[0],
	});

	const meta: SidecarBrandsMeta = {
		airtableCount: records.length,
		returnedCount: mapped.length,
		allowlistActive: policy.allowlistNames.length > 0,
		userFilterActive: policy.mode === 'user_id',
		accessMode: policy.mode,
		emptyReason: buildEmptyReason({
			airtableCount: records.length,
			namedCount: mapped.length,
			returnedCount: mapped.length,
			policy,
		}),
	};

	return { brands: mapped, meta };
}

export async function resolveBrandProfile(options: {
	ownerUserId: string;
	brandId?: string;
	brandName?: string;
}): Promise<SidecarBrandProfile> {
	const table = requireEnv('AIRTABLE_BRANDPROFILES_TABLE');
	const policy = await resolveBrandAccessPolicy(options.ownerUserId);

	let record: { id: string; fields: Record<string, unknown> } | null = null;

	if (options.brandId) {
		record = await fetchBrandProfileRecordById(table, options.brandId);
		assertRecordAccessible(policy, record);
	} else if (options.brandName) {
		if (!policy.allowlistNormalized && policy.mode === 'allowlist_only') {
			throw new SidecarError('Brand access is not configured', {
				status: 503,
				code: 'sidecar_brand_access_not_configured',
			});
		}
		const normalized = options.brandName.trim().toLowerCase();
		if (policy.allowlistNormalized && !policy.allowlistNormalized.has(normalized)) {
			throw new SidecarError('Brand is not enabled for Sidecar', {
				status: 403,
				code: 'sidecar_brand_not_allowed',
			});
		}

		record = await fetchBrandProfileByName(
			table,
			options.brandName,
			policy.mode === 'user_id' ? options.ownerUserId : undefined,
			policy.mode === 'user_id',
		);
		if (record) {
			assertRecordAccessible(policy, record);
		}
	}

	if (!record) {
		throw new SidecarError('Brand not found', { status: 404, code: 'sidecar_brand_not_found' });
	}

	const parsed = parseBrandProfileFromFields(record);
	const name = parsed.name.trim();
	if (!name) {
		throw new SidecarError('Brand profile has no readable client_name', {
			status: 502,
			code: 'sidecar_brand_fetch_failed',
		});
	}

	return {
		id: record.id,
		name,
		status: parsed.status,
		brand_type: parsed.brand_type,
		platforms_requested: parsed.platforms_requested,
		fields: record.fields,
	};
}

export function buildBrandVoiceContext(profile: SidecarBrandProfile): string {
	const f = profile.fields;
	const isPersonal = fieldString(f, 'brand_type') === 'personal' || profile.brand_type === 'personal';

	const sections: string[] = [
		`Brand: ${profile.name}`,
		`Type: ${fieldString(f, 'brand_type') || profile.brand_type || 'company'}`,
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
