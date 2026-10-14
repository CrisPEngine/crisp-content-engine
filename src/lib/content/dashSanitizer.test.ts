import { describe, expect, it } from 'vitest';
import { containsForbiddenDash, sanitizeTextDashes } from './dashSanitizer';

describe('dashSanitizer', () => {
	it('detects em dashes', () => {
		expect(containsForbiddenDash('Hello — world')).toBe(true);
	});

	it('replaces em dash with comma', () => {
		const { text, changed } = sanitizeTextDashes('One idea — many channels');
		expect(changed).toBe(true);
		expect(text).toBe('One idea, many channels');
		expect(containsForbiddenDash(text)).toBe(false);
	});

	it('replaces spaced en dash used as punctuation', () => {
		const { text } = sanitizeTextDashes('Ship fast – learn faster');
		expect(text).not.toContain('\u2013');
		expect(containsForbiddenDash(text)).toBe(false);
	});

	it('keeps numeric ranges as hyphens', () => {
		const { text } = sanitizeTextDashes('Week 1–3 focus');
		expect(text).toContain('1-3');
	});
});
