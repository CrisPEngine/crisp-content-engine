import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntelligenceStore } from '../store';
import type { ContentMemoryRecord } from '../types';
import { confirmMemoryToContentQueue } from '../queueBridge';

const memory: ContentMemoryRecord = {
	id: 'mem-1',
	userId: 'user-1',
	brandBrainId: 'brain-1',
	channel: 'linkedin',
	hook: 'Hook',
	body: 'Body',
	publicationStatus: 'draft',
	createdAt: '2026-10-01T00:00:00.000Z',
};

function store(): IntelligenceStore {
	return {
		getBrandBrainById: vi.fn().mockResolvedValue({
			id: 'brain-1',
			airtableBrandId: 'recBrand',
			identity: { name: 'Folian' },
		}),
		saveMemory: vi.fn().mockImplementation(async (_userId, record) => record),
	} as unknown as IntelligenceStore;
}

describe('confirmMemoryToContentQueue', () => {
	beforeEach(() => {
		process.env.AIRTABLE_PAT = 'pat';
		process.env.AIRTABLE_BASE_ID = 'base';
		process.env.AIRTABLE_CONTENTQUEUE_TABLE = 'queue';
	});

	it('does not create a second Airtable record when the memory is already mapped', async () => {
		const fetchSpy = vi.spyOn(global, 'fetch');
		const result = await confirmMemoryToContentQueue({
			store: store(),
			userId: 'user-1',
			memory: { ...memory, airtableContentId: 'recExisting' },
		});
		expect(result).toEqual({
			airtableRecordId: 'recExisting',
			idempotent: true,
			status: 'Needs Approval',
			platform: 'LinkedIn',
		});
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	it('writes Needs Approval LinkedIn fields and stores the Airtable id', async () => {
		const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
			ok: true,
			json: async () => ({ id: 'recNew' }),
		} as Response);
		const intel = store();
		const result = await confirmMemoryToContentQueue({
			store: intel,
			userId: 'user-1',
			memory,
		});
		expect(result.airtableRecordId).toBe('recNew');
		expect(result.idempotent).toBe(false);
		const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
		expect(body.fields.status).toBe('Needs Approval');
		expect(body.fields.platform).toBe('LinkedIn');
		expect(body.fields.generated_from).toBe('intelligence');
		expect(body.fields.brand_profile_id).toEqual(['recBrand']);
		expect(body.fields.client_name).toEqual(['recBrand']);
		expect(intel.saveMemory).toHaveBeenCalledWith(
			'user-1',
			expect.objectContaining({ airtableContentId: 'recNew' }),
		);
		fetchSpy.mockRestore();
	});
});
