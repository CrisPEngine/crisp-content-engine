import 'server-only';

import { listRecords } from '@/lib/airtable/client';
import { resolveIdeaEngineHistoryTimeoutMs } from '../config';
import type { PreviousContentEntry } from '../types';
import {
	IDEA_ENGINE_CONTENTQUEUE_FIELD_NAMES,
	IDEA_ENGINE_HISTORY_WARNING,
	mapContentHistoryRecord,
} from '../airtable/contentQueueQuery';

export type ContentHistoryLoadResult = {
	entries: PreviousContentEntry[];
	warning?: string;
};

export async function loadContentHistory(
	brandProfileId: string,
	maxRecords = 30,
): Promise<ContentHistoryLoadResult> {
	const table = process.env.AIRTABLE_TABLE_NAME || process.env.AIRTABLE_CONTENTQUEUE_TABLE;
	if (!table || !process.env.AIRTABLE_PAT || !process.env.AIRTABLE_BASE_ID) {
		return { entries: [] };
	}

	try {
		const escapedId = brandProfileId.replace(/"/g, '""');
		const historyTimeoutMs = resolveIdeaEngineHistoryTimeoutMs();
		const records = await Promise.race([
			listRecords({
			table,
			filterByFormula: `FIND("${escapedId}", {${IDEA_ENGINE_CONTENTQUEUE_FIELD_NAMES.brand_profile_id}})`,
			fields: [
				IDEA_ENGINE_CONTENTQUEUE_FIELD_NAMES.platform,
				IDEA_ENGINE_CONTENTQUEUE_FIELD_NAMES.hook,
				IDEA_ENGINE_CONTENTQUEUE_FIELD_NAMES.post_content,
				IDEA_ENGINE_CONTENTQUEUE_FIELD_NAMES.status,
				IDEA_ENGINE_CONTENTQUEUE_FIELD_NAMES.created_time,
			],
			sort: [
				{
					field: IDEA_ENGINE_CONTENTQUEUE_FIELD_NAMES.created_time,
					direction: 'desc',
				},
			],
			maxRecords,
			cache: false,
			returnFieldsByFieldId: true,
			endpoint: '/api/idea-engine/load-history',
			}),
			new Promise<never>((_, reject) => {
				setTimeout(
					() => reject(new Error(`Content history fetch timed out after ${historyTimeoutMs}ms`)),
					historyTimeoutMs,
				);
			}),
		]);

		return {
			entries: records.map((record) => mapContentHistoryRecord(record) as PreviousContentEntry),
		};
	} catch (error) {
		console.warn('[IdeaEngine] Content history fetch failed:', error);
		return {
			entries: [],
			warning: IDEA_ENGINE_HISTORY_WARNING,
		};
	}
}
