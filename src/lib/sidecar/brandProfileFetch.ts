import 'server-only';

import { getRecord, listRecords } from '@/lib/airtable/client';
import { readBrandProfileRecord } from '@/lib/airtable/readBrandProfileRecord';
import { logSidecarDraftStep } from './draftDiagnostics';

/** Fields known to exist on BrandProfiles (same set as /api/sidecar/brands list). */
const LIST_FIELD_NAMES = [
	'client_name',
	'status',
	'brand_type',
	'platforms_requested',
] as const;

const VOICE_FIELD_NAMES = [
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
	'timezone',
	'language_region',
	'approval_contact_email',
	'user_id',
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

export function isRecoverableAirtableFieldError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes('UNKNOWN_FIELD_NAME') ||
		message.includes('UNKNOWN_FIELD') ||
		message.includes('INVALID_VALUE_FOR_COLUMN') ||
		message.includes('"type":"INVALID_REQUEST_ERROR"')
	);
}

function isAirtableNotFound(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes('404') || message.includes('NOT_FOUND') || message.includes('Could not find');
}

/**
 * Load a BrandProfiles row for draft voice context.
 * Primary: GET record without fields[] (same as /api/content/generate).
 * Fallback: list by RECORD_ID() with returnFieldsByFieldId (same as /api/sidecar/brands).
 */
export async function fetchBrandProfileRecordById(
	table: string,
	recordId: string,
): Promise<{ id: string; fields: Record<string, unknown> }> {
	try {
		const fetched = await getRecord({ table, recordId });
		logSidecarDraftStep('brand_fetch_get_record', { recordId, fieldKeyCount: Object.keys(fetched.fields || {}).length });
		return { id: fetched.id, fields: (fetched.fields || {}) as Record<string, unknown> };
	} catch (error) {
		if (isAirtableNotFound(error)) throw error;
		logSidecarDraftStep('brand_fetch_get_record_failed', {
			recordId,
			willRetryList: true,
			errorType: error instanceof Error ? error.name : 'unknown',
		});
	}

	const escapedId = recordId.replace(/"/g, '""');
	const fieldSets: string[][] = [
		[...LIST_FIELD_NAMES, ...VOICE_FIELD_NAMES],
		[...LIST_FIELD_NAMES],
	];

	for (const fields of fieldSets) {
		try {
			const records = await listRecords({
				table,
				filterByFormula: `RECORD_ID() = "${escapedId}"`,
				fields,
				maxRecords: 1,
				cache: false,
				returnFieldsByFieldId: true,
				endpoint: '/api/sidecar/draft',
			});
			if (records[0]) {
				logSidecarDraftStep('brand_fetch_list_fallback', {
					recordId,
					fieldCount: fields.length,
				});
				return {
					id: records[0].id,
					fields: (records[0].fields || {}) as Record<string, unknown>,
				};
			}
		} catch (listError) {
			if (!isRecoverableAirtableFieldError(listError)) throw listError;
		}
	}

	throw new Error(`Airtable API error: 404 - BrandProfiles record not found (${recordId})`);
}

export async function fetchBrandProfileByName(
	table: string,
	brandName: string,
	ownerUserId: string | undefined,
	userFilterActive: boolean,
): Promise<{ id: string; fields: Record<string, unknown> } | null> {
	const escaped = brandName.replace(/"/g, '""');
	const formula = userFilterActive && ownerUserId
		? `AND({user_id} = "${ownerUserId}", {client_name} = "${escaped}")`
		: `{client_name} = "${escaped}"`;

	const fieldSets: string[][] = [
		[...LIST_FIELD_NAMES, ...VOICE_FIELD_NAMES],
		[...LIST_FIELD_NAMES],
	];

	for (const fields of fieldSets) {
		try {
			const records = await listRecords({
				table,
				filterByFormula: formula,
				fields,
				maxRecords: 1,
				cache: false,
				returnFieldsByFieldId: true,
				endpoint: '/api/sidecar/draft',
			});
			if (records[0]) {
				return {
					id: records[0].id,
					fields: (records[0].fields || {}) as Record<string, unknown>,
				};
			}
			return null;
		} catch (error) {
			if (!isRecoverableAirtableFieldError(error)) throw error;
		}
	}

	return null;
}

export function parseBrandProfileFromFields(
	record: { id: string; fields: Record<string, unknown> },
): { id: string; name: string; status: string; brand_type?: string; platforms_requested?: string[] } {
	const parsed = readBrandProfileRecord(record);
	return {
		id: record.id,
		name: parsed.client_name,
		status: parsed.status,
		brand_type: parsed.brand_type,
		platforms_requested: parsed.platforms_requested,
	};
}
