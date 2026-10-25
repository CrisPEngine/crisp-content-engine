import { describe, expect, it } from 'vitest';
import {
	bodyEndsCompleteSentence,
	coerceModelText,
	ensureBodyWithinChannelLimit,
	trimBodyAtSentenceBoundary,
} from '../channelBodyLimit';

describe('coerceModelText', () => {
	it('returns strings unchanged', () => {
		expect(coerceModelText(' hello ')).toBe(' hello ');
	});

	it('unwraps common structured model shapes', () => {
		expect(coerceModelText({ text: 'line' })).toBe('line');
		expect(coerceModelText({ draft: 'draft field' })).toBe('draft field');
		expect(coerceModelText(['one', 'two'])).toBe('one\ntwo');
	});

	it('coerces numbers without throwing', () => {
		expect(coerceModelText(42)).toBe('42');
	});
});

describe('trimBodyAtSentenceBoundary', () => {
	it('prefers cutting at the last question mark within the limit', () => {
		const body =
			'Short opener about canon. Middle paragraph with extra detail that runs long. How do you track continuity? #Folian extra words that should not appear.';
		const trimmed = trimBodyAtSentenceBoundary(body, 120);
		expect(trimmed.length).toBeLessThanOrEqual(120);
		expect(trimmed).toMatch(/\?\s*$/);
		expect(trimmed).not.toMatch(/extra words/);
	});
});

describe('ensureBodyWithinChannelLimit', () => {
	it('calls tighten until the body fits', async () => {
		const long = `${'Word '.repeat(120)}How do you track time? #Folian`;
		const result = await ensureBodyWithinChannelLimit({
			channel: 'threads',
			body: long,
			tighten: async () => 'Canon stays with the author. How do you track time? #Folian',
		});
		expect(result.body.length).toBeLessThanOrEqual(500);
		expect(result.adjusted).toBe(true);
		expect(bodyEndsCompleteSentence(result.body)).toBe(true);
	});
});
