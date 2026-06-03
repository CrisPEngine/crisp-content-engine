import { describe, expect, it } from 'vitest';
import { identifyBrandProfileFields, readBrandProfileRecord } from '../readBrandProfileRecord';

describe('readBrandProfileRecord', () => {
	it('reads client_name when fields are keyed by name', () => {
		const result = readBrandProfileRecord({
			id: 'rec1',
			fields: {
				client_name: 'CrisP Digital',
				status: 'Strategy Ready',
				brand_type: 'company',
			},
		});
		expect(result.client_name).toBe('CrisP Digital');
	});

	it('reads client_name when fields are keyed by field ID (returnFieldsByFieldId)', () => {
		const result = identifyBrandProfileFields({
			fldName123: 'Bianca Pascoe',
			fldStatus456: 'New Brief',
			fldType789: 'personal',
		});
		expect(result.client_name).toBe('Bianca Pascoe');
		expect(result.status).toBe('New Brief');
		expect(result.brand_type).toBe('personal');
	});
});
