import { afterEach, describe, expect, it } from 'vitest';
import {
	diagnoseBrandProfileFieldResolution,
	identifyBrandProfileFields,
	readBrandProfileRecord,
	readBrandProfileUserId,
} from '../readBrandProfileRecord';

const CLIENT_NAME_FIELD_ID = 'fld9i3rA29NuS0Mjn';
const USER_ID_FIELD_ID = 'fld70rABHKmGpVHFM';
const OWNER = '11111111-1111-1111-1111-111111111111';

function withFieldIdEnv(run: () => void) {
	const prevClient = process.env.AIRTABLE_BRANDPROFILES_CLIENT_NAME_FIELD_ID;
	const prevUser = process.env.AIRTABLE_BRANDPROFILES_USER_ID_FIELD_ID;
	process.env.AIRTABLE_BRANDPROFILES_CLIENT_NAME_FIELD_ID = CLIENT_NAME_FIELD_ID;
	process.env.AIRTABLE_BRANDPROFILES_USER_ID_FIELD_ID = USER_ID_FIELD_ID;
	try {
		run();
	} finally {
		if (prevClient === undefined) {
			delete process.env.AIRTABLE_BRANDPROFILES_CLIENT_NAME_FIELD_ID;
		} else {
			process.env.AIRTABLE_BRANDPROFILES_CLIENT_NAME_FIELD_ID = prevClient;
		}
		if (prevUser === undefined) {
			delete process.env.AIRTABLE_BRANDPROFILES_USER_ID_FIELD_ID;
		} else {
			process.env.AIRTABLE_BRANDPROFILES_USER_ID_FIELD_ID = prevUser;
		}
	}
}

afterEach(() => {
	delete process.env.AIRTABLE_BRANDPROFILES_CLIENT_NAME_FIELD_ID;
	delete process.env.AIRTABLE_BRANDPROFILES_USER_ID_FIELD_ID;
});

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

	it('reads client_name when fields are keyed by field ID (heuristic)', () => {
		const result = identifyBrandProfileFields({
			fldName123: 'Bianca Pascoe',
			fldStatus456: 'New Brief',
			fldType789: 'personal',
		});
		expect(result.client_name).toBe('Bianca Pascoe');
		expect(result.status).toBe('New Brief');
		expect(result.brand_type).toBe('personal');
	});

	it('reads client_name and user_id by configured BrandProfiles field IDs', () => {
		withFieldIdEnv(() => {
			const fields = {
				[CLIENT_NAME_FIELD_ID]: 'CrisP Digital',
				[USER_ID_FIELD_ID]: OWNER,
				fldStatus456: 'Strategy Ready',
			};
			const result = readBrandProfileRecord({ id: 'rec2', fields });
			expect(result.client_name).toBe('CrisP Digital');
			expect(readBrandProfileUserId(fields)).toBe(OWNER);
		});
	});

	it('does not treat user_id UUID as client_name when field IDs are configured', () => {
		withFieldIdEnv(() => {
			const result = identifyBrandProfileFields({
				[USER_ID_FIELD_ID]: OWNER,
				[CLIENT_NAME_FIELD_ID]: 'My Brand',
				fldStatus456: 'New Brief',
			});
			expect(result.client_name).toBe('My Brand');
			expect(result.client_name).not.toBe(OWNER);
		});
	});

	it('diagnoses missing client_name field ID on owner-matched records', () => {
		withFieldIdEnv(() => {
			const fields = {
				[USER_ID_FIELD_ID]: OWNER,
				fldStatus456: 'New Brief',
			};
			const diag = diagnoseBrandProfileFieldResolution(fields);
			expect(diag.resolvedUserId).toBe(OWNER);
			expect(diag.resolvedClientName).toBe('');
			expect(diag.hasUserIdFieldIdKey).toBe(true);
			expect(diag.hasClientNameFieldIdKey).toBe(false);
			expect(diag.fieldsKeyedById).toBe(true);
		});
	});
});
