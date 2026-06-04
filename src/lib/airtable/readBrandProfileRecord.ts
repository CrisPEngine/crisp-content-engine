/**
 * Read BrandProfiles Airtable records.
 *
 * listRecords defaults to returnFieldsByFieldId=true (responses keyed by field ID).
 * Use getBrandProfileField + identifyBrandProfileFields (same approach as /api/brands).
 */

const KNOWN_STATUS_SNIPPETS = [
	'New Brief',
	'Strategy Ready',
	'Strategy Approved',
	'Needs Strategy',
	'Strategy Ready (Awaiting Approval)',
	'Content Review',
] as const;

export type ParsedBrandProfileFields = {
	client_name: string;
	status: string;
	brand_type?: string;
	platforms_requested: string[];
};

export type BrandProfilesFieldIds = {
	clientName: string | undefined;
	userId: string | undefined;
};

export function getBrandProfilesFieldIds(): BrandProfilesFieldIds {
	return {
		clientName: process.env.AIRTABLE_BRANDPROFILES_CLIENT_NAME_FIELD_ID?.trim() || undefined,
		userId: process.env.AIRTABLE_BRANDPROFILES_USER_ID_FIELD_ID?.trim() || undefined,
	};
}

export function getBrandProfileField(
	fields: Record<string, unknown>,
	fieldName: string,
	fieldId?: string,
): unknown {
	if (fieldId) {
		const byId = fields[fieldId];
		if (byId !== undefined && byId !== null) return byId;
	}
	return fields[fieldName];
}

function fieldToString(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (Array.isArray(value)) return value.map(String).join(', ');
	return String(value);
}

function isUuidLike(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function looksLikeClientNameCandidate(value: string): boolean {
	if (!value || value.length >= 200) return false;
	if (isUuidLike(value)) return false;
	const isDate =
		/^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(value);
	if (isDate) return false;
	if (value.includes('http://') || value.includes('https://')) return false;
	if (KNOWN_STATUS_SNIPPETS.some((s) => value.includes(s))) return false;
	return true;
}

function isUserIdFieldKey(fieldKey: string, ids: BrandProfilesFieldIds): boolean {
	return fieldKey === 'user_id' || (ids.userId !== undefined && fieldKey === ids.userId);
}

/**
 * Resolve BrandProfiles owner UUID from field-ID or name-keyed responses.
 */
export function readBrandProfileUserId(fields: Record<string, unknown>): string {
	const ids = getBrandProfilesFieldIds();
	const value = getBrandProfileField(fields, 'user_id', ids.userId);
	return fieldToString(value).trim();
}

export type BrandProfileFieldResolutionDiagnostic = {
	resolvedClientName: string;
	resolvedUserId: string;
	fieldsKeyedById: boolean;
	hasClientNameFieldIdKey: boolean;
	hasUserIdFieldIdKey: boolean;
	hasClientNameNameKey: boolean;
	hasUserIdNameKey: boolean;
	configuredClientNameFieldId?: string;
	configuredUserIdFieldId?: string;
	fieldKeyCount: number;
};

export function diagnoseBrandProfileFieldResolution(
	fields: Record<string, unknown>,
): BrandProfileFieldResolutionDiagnostic {
	const ids = getBrandProfilesFieldIds();
	const fieldKeys = Object.keys(fields);
	const parsed = identifyBrandProfileFields(fields);
	return {
		resolvedClientName: parsed.client_name,
		resolvedUserId: readBrandProfileUserId(fields),
		fieldsKeyedById: fieldKeys.length > 0 && fieldKeys.every((k) => k.startsWith('fld')),
		hasClientNameFieldIdKey: Boolean(ids.clientName && ids.clientName in fields),
		hasUserIdFieldIdKey: Boolean(ids.userId && ids.userId in fields),
		hasClientNameNameKey: 'client_name' in fields,
		hasUserIdNameKey: 'user_id' in fields,
		configuredClientNameFieldId: ids.clientName,
		configuredUserIdFieldId: ids.userId,
		fieldKeyCount: fieldKeys.length,
	};
}

/**
 * When returnFieldsByFieldId=true, logical names are not present as keys.
 * Resolve client_name, status, etc. via env field IDs, names, then heuristics.
 */
export function identifyBrandProfileFields(
	fields: Record<string, unknown>,
): ParsedBrandProfileFields {
	const ids = getBrandProfilesFieldIds();

	let clientName = fieldToString(
		getBrandProfileField(fields, 'client_name', ids.clientName),
	);
	let status = fieldToString(getBrandProfileField(fields, 'status'));
	let brandType = fieldToString(getBrandProfileField(fields, 'brand_type'));
	let platformsRequested = getBrandProfileField(fields, 'platforms_requested');

	const fieldKeys = Object.keys(fields);
	const keysLookLikeIds = fieldKeys.length > 0 && fieldKeys.every((k) => k.startsWith('fld'));

	if (!keysLookLikeIds && clientName) {
		return {
			client_name: clientName.trim(),
			status: status || 'New Brief',
			brand_type: brandType || undefined,
			platforms_requested: Array.isArray(platformsRequested)
				? (platformsRequested as string[])
				: [],
		};
	}

	if (clientName) {
		return {
			client_name: clientName.trim(),
			status: status || 'New Brief',
			brand_type: brandType || undefined,
			platforms_requested: Array.isArray(platformsRequested)
				? (platformsRequested as string[])
				: [],
		};
	}

	for (const fieldKey of fieldKeys) {
		const value = fields[fieldKey];

		if (isUserIdFieldKey(fieldKey, ids)) {
			continue;
		}

		if (!clientName && typeof value === 'string' && looksLikeClientNameCandidate(value)) {
			clientName = value;
		} else if (
			!status &&
			typeof value === 'string' &&
			KNOWN_STATUS_SNIPPETS.some((s) => value.includes(s))
		) {
			status = value;
		} else if (
			!brandType &&
			typeof value === 'string' &&
			(value === 'personal' || value === 'company')
		) {
			brandType = value;
		} else if (
			!platformsRequested &&
			Array.isArray(value) &&
			value.length > 0 &&
			typeof value[0] === 'string'
		) {
			platformsRequested = value;
		}
	}

	return {
		client_name: clientName.trim(),
		status: status || 'New Brief',
		brand_type: brandType || undefined,
		platforms_requested: Array.isArray(platformsRequested)
			? (platformsRequested as string[])
			: [],
	};
}

export function readBrandProfileRecord(record: {
	id: string;
	fields?: Record<string, unknown>;
}): { id: string } & ParsedBrandProfileFields {
	const fields = (record.fields || {}) as Record<string, unknown>;
	const parsed = identifyBrandProfileFields(fields);
	return {
		id: record.id,
		...parsed,
	};
}

export function logBrandProfilesFetchDiagnostics(options: {
	endpoint: string;
	recordCount: number;
	mappedCount: number;
	firstRecord?: { id: string; fields?: Record<string, unknown> };
}): void {
	if (process.env.NODE_ENV === 'production') return;

	const fields = (options.firstRecord?.fields || {}) as Record<string, unknown>;
	const diag = options.firstRecord ? diagnoseBrandProfileFieldResolution(fields) : null;

	console.log(`[${options.endpoint}] BrandProfiles fetch`, {
		recordCount: options.recordCount,
		mappedCount: options.mappedCount,
		firstRecordFieldKeys: Object.keys(fields).slice(0, 15),
		...diag,
	});
}
