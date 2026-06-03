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

/**
 * When returnFieldsByFieldId=true, logical names are not present as keys.
 * Mirror /api/brands heuristics to resolve client_name, status, etc.
 */
export function identifyBrandProfileFields(
	fields: Record<string, unknown>,
): ParsedBrandProfileFields {
	let clientName = fieldToString(getBrandProfileField(fields, 'client_name'));
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

	for (const fieldId of fieldKeys) {
		const value = fields[fieldId];

		if (!clientName && typeof value === 'string' && value.length > 0 && value.length < 200) {
			const isDate =
				/^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(value);
			const looksLikeUrl = value.includes('http://') || value.includes('https://');
			if (!isDate && !looksLikeUrl && !KNOWN_STATUS_SNIPPETS.some((s) => value.includes(s))) {
				clientName = value;
			}
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

	const keys = options.firstRecord ? Object.keys(options.firstRecord.fields || {}) : [];
	const fields = (options.firstRecord?.fields || {}) as Record<string, unknown>;
	const parsed = options.firstRecord ? identifyBrandProfileFields(fields) : null;

	console.log(`[${options.endpoint}] BrandProfiles fetch`, {
		recordCount: options.recordCount,
		mappedCount: options.mappedCount,
		firstRecordFieldKeys: keys.slice(0, 15),
		hasClientNameKey: keys.includes('client_name'),
		hasClientNameValue: Boolean(parsed?.client_name),
		fieldsKeyedById: keys.length > 0 && keys.every((k) => k.startsWith('fld')),
	});
}
