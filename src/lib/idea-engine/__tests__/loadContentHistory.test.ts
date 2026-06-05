import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/airtable/client', () => ({
	listRecords: vi.fn(),
}));

import { listRecords } from '@/lib/airtable/client';
import {
	IDEA_ENGINE_CONTENTQUEUE_FIELD_IDS,
	IDEA_ENGINE_HISTORY_WARNING,
} from '../airtable/contentQueueQuery';
import { loadContentHistory } from '../data/loadContentHistory';

describe('loadContentHistory', () => {
	beforeEach(() => {
		vi.mocked(listRecords).mockReset();
		process.env.AIRTABLE_PAT = 'pat-test';
		process.env.AIRTABLE_BASE_ID = 'app-test';
		process.env.AIRTABLE_CONTENTQUEUE_TABLE = 'ContentQueue';
	});

	it('queries ContentQueue with project field names and created_time sort', async () => {
		vi.mocked(listRecords).mockResolvedValueOnce([
			{
				fields: {
					[IDEA_ENGINE_CONTENTQUEUE_FIELD_IDS.hook]: 'Old hook',
					[IDEA_ENGINE_CONTENTQUEUE_FIELD_IDS.platform]: 'LinkedIn',
					[IDEA_ENGINE_CONTENTQUEUE_FIELD_IDS.post_content]: 'Body',
					[IDEA_ENGINE_CONTENTQUEUE_FIELD_IDS.status]: 'Published',
					[IDEA_ENGINE_CONTENTQUEUE_FIELD_IDS.created_time]: '2026-01-01T00:00:00.000Z',
				},
			},
		]);

		const result = await loadContentHistory('recBrand123');

		expect(result.warning).toBeUndefined();
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]).toMatchObject({
			hook: 'Old hook',
			platform: 'LinkedIn',
			post_title: 'Old hook',
		});

		expect(listRecords).toHaveBeenCalledWith(
			expect.objectContaining({
				sort: [{ field: 'created_time', direction: 'desc' }],
				fields: ['platform', 'hook', 'post_content', 'status', 'created_time'],
				filterByFormula: 'FIND("recBrand123", {brand_profile_id})',
				returnFieldsByFieldId: true,
			}),
		);
	});

	it('returns empty history and warning when Airtable rejects unknown fields', async () => {
		vi.mocked(listRecords).mockRejectedValueOnce(
			new Error(
				'Airtable API error: 422 - {"error":{"type":"UNKNOWN_FIELD_NAME","message":"Unknown field name: \\"Created Time\\""}}',
			),
		);

		const result = await loadContentHistory('recBrand123');

		expect(result.entries).toEqual([]);
		expect(result.warning).toBe(IDEA_ENGINE_HISTORY_WARNING);
	});

	it('returns empty history when Airtable is not configured', async () => {
		delete process.env.AIRTABLE_PAT;
		const result = await loadContentHistory('recBrand123');
		expect(result.entries).toEqual([]);
		expect(listRecords).not.toHaveBeenCalled();
	});
});
