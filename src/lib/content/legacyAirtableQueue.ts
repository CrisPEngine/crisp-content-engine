import 'server-only';

import { listRecords } from '@/lib/airtable/client';

export type LegacyQueueItem = {
	id: string;
	platform: string;
	hook: string;
	status: string;
	created_time: string;
	source: 'legacy_airtable';
};

export async function listLegacyAirtableQueueForBrand(input: {
	userId: string;
	brandProfileId: string;
	limit?: number;
}): Promise<LegacyQueueItem[]> {
	const table = process.env.AIRTABLE_CONTENTQUEUE_TABLE;
	if (!table) return [];

	const formula = `AND(FIND("${input.brandProfileId}", {brand_profile_id}), FIND("${input.userId}", ARRAYJOIN({user_id_lookup}, ",")))`;
	try {
		const records = await listRecords({
			table,
			filterByFormula: formula,
			maxRecords: input.limit ?? 40,
			fields: ['platform', 'hook', 'status', 'created_time', 'brand_profile_id', 'post_content'],
			endpoint: '/api/content/legacy-queue',
			returnFieldsByFieldId: false,
		});
		return records.map((record) => ({
			id: record.id,
			platform: String(record.fields.platform ?? ''),
			hook: String(record.fields.hook ?? record.fields.post_content ?? '').slice(0, 120),
			status: String(record.fields.status ?? 'Legacy'),
			created_time: String(record.fields.created_time ?? record.createdTime ?? ''),
			source: 'legacy_airtable' as const,
		}));
	} catch (error) {
		console.warn('[Legacy queue] list failed:', error);
		return [];
	}
}
