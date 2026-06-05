import 'server-only';

import { listRecords } from '@/lib/airtable/client';
import type { PreviousContentEntry } from '../types';

export async function loadContentHistory(
	brandProfileId: string,
	maxRecords = 30,
): Promise<PreviousContentEntry[]> {
	const table = process.env.AIRTABLE_TABLE_NAME || process.env.AIRTABLE_CONTENTQUEUE_TABLE;
	if (!table || !process.env.AIRTABLE_PAT || !process.env.AIRTABLE_BASE_ID) {
		return [];
	}

	try {
		const escapedId = brandProfileId.replace(/"/g, '""');
		const records = await listRecords({
			table,
			filterByFormula: `AND({Brand Profile} = "${escapedId}", OR({Status} = "Published", {Status} = "Approved", {Status} = "Scheduled"))`,
			fields: ['Post Title', 'Post Content', 'Platform', 'Status'],
			sort: [{ field: 'Created Time', direction: 'desc' }],
			maxRecords,
			cache: false,
			endpoint: '/api/idea-engine/load-history',
		});

		return records.map((r) => (r.fields || {}) as PreviousContentEntry);
	} catch (error) {
		console.warn('[IdeaEngine] Content history fetch failed:', error);
		return [];
	}
}
