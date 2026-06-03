import 'server-only';

import { getRecord, listRecords } from '@/lib/airtable/client';
import { SidecarError } from './errors';
import { DEFAULT_BRAND_ALLOWLIST } from './schemas';

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

function parseBrandAllowlist(): Set<string> | null {
	const raw = process.env.SIDECAR_BRAND_ALLOWLIST;
	if (!raw?.trim()) {
		return new Set(DEFAULT_BRAND_ALLOWLIST.map((n) => n.toLowerCase()));
	}
	return new Set(
		raw
			.split(',')
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean),
	);
}

function fieldString(fields: Record<string, unknown>, key: string): string {
	const value = fields[key];
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return value.map(String).join(', ');
	return String(value);
}

export async function listSidecarBrands(ownerUserId: string): Promise<SidecarBrandSummary[]> {
	const table = requireEnv('AIRTABLE_BRANDPROFILES_TABLE');
	const allowlist = parseBrandAllowlist();

	const records = await listRecords({
		table,
		filterByFormula: `{user_id} = "${ownerUserId}"`,
		fields: ['client_name', 'status', 'brand_type', 'platforms_requested', 'user_id'],
		cache: false,
		endpoint: '/api/sidecar/brands',
	});

	return records
		.map((record) => {
			const fields = record.fields || {};
			const name = fieldString(fields as Record<string, unknown>, 'client_name');
			return {
				id: record.id,
				name,
				status: fieldString(fields as Record<string, unknown>, 'status') || 'New Brief',
				brand_type: fieldString(fields as Record<string, unknown>, 'brand_type') || undefined,
				platforms_requested: Array.isArray(fields.platforms_requested)
					? (fields.platforms_requested as string[])
					: [],
			};
		})
		.filter((b) => b.name && (!allowlist || allowlist.has(b.name.toLowerCase())));
}

export async function resolveBrandProfile(options: {
	ownerUserId: string;
	brandId?: string;
	brandName?: string;
}): Promise<SidecarBrandProfile> {
	const table = requireEnv('AIRTABLE_BRANDPROFILES_TABLE');

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
		const records = await listRecords({
			table,
			filterByFormula: `AND({user_id} = "${options.ownerUserId}", {client_name} = "${escaped}")`,
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

	const userId = fieldString(record.fields, 'user_id');
	if (userId && userId !== options.ownerUserId) {
		throw new SidecarError('Brand access denied', { status: 403, code: 'sidecar_brand_forbidden' });
	}

	const name = fieldString(record.fields, 'client_name');
	const allowlist = parseBrandAllowlist();
	if (allowlist && name && !allowlist.has(name.toLowerCase())) {
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
