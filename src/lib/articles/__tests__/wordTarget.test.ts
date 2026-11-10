import { describe, expect, it } from 'vitest';
import { MAX_TARGET_WORDS, MIN_TARGET_WORDS, normaliseTargetWords } from '../pipeline';

describe('normaliseTargetWords', () => {
	it('keeps an exact user request such as 2500 instead of snapping to a tier', () => {
		expect(normaliseTargetWords(2500)).toBe(2500);
		expect(normaliseTargetWords(2000)).toBe(2000);
		expect(normaliseTargetWords(3200)).toBe(3200);
	});

	it('clamps missing or out-of-range values without inventing tiers', () => {
		expect(normaliseTargetWords(undefined)).toBe(1500);
		expect(normaliseTargetWords(0)).toBe(1500);
		expect(normaliseTargetWords(100)).toBe(MIN_TARGET_WORDS);
		expect(normaliseTargetWords(50_000)).toBe(MAX_TARGET_WORDS);
	});
});
