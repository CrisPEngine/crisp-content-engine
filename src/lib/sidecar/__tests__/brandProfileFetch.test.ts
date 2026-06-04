import { describe, expect, it } from 'vitest';
import { isRecoverableAirtableFieldError } from '../brandProfileFetch';

describe('isRecoverableAirtableFieldError', () => {
	it('detects UNKNOWN_FIELD_NAME in Airtable error JSON', () => {
		const err = new Error(
			'Airtable API error: 422 - {"error":{"type":"UNKNOWN_FIELD_NAME","message":"Unknown field name: \\"personal_risk_tolerance\\""}}',
		);
		expect(isRecoverableAirtableFieldError(err)).toBe(true);
	});

	it('returns false for unrelated errors', () => {
		expect(isRecoverableAirtableFieldError(new Error('network timeout'))).toBe(false);
	});
});
