import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { coerceBoolean } from '../coerceBoolean';

/** Mirrors the client onboarding field for avoid_negative_tones. */
const avoidNegativeTonesField = z.preprocess(
	(val) => coerceBoolean(val, true),
	z.boolean().default(true),
);

describe('onboarding client avoid_negative_tones', () => {
	it('accepts empty string from legacy company-brand drafts', () => {
		expect(avoidNegativeTonesField.parse('')).toBe(true);
	});

	it('accepts string true/false from localStorage', () => {
		expect(avoidNegativeTonesField.parse('true')).toBe(true);
		expect(avoidNegativeTonesField.parse('false')).toBe(false);
	});
});
