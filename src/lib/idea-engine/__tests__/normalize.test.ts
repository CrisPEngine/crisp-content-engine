import { describe, expect, it } from 'vitest';
import { normalizeGeneratedItem } from '../validation/normalize';

describe('normalizeGeneratedItem', () => {
	it('persists hook and post_title distinctly when both provided', () => {
		const normalized = normalizeGeneratedItem({
			channel: 'LinkedIn',
			post_title: 'Headline',
			hook: 'Scroll-stopping hook',
			body_draft: 'Body text',
			series_position: 1,
			series_total: 2,
		});

		expect(normalized.post_title).toBe('Headline');
		expect(normalized.hook).toBe('Scroll-stopping hook');
	});

	it('uses post_title as hook fallback', () => {
		const normalized = normalizeGeneratedItem({
			channel: 'X',
			post_title: 'Only title',
			body_draft: 'Tweet body',
			series_position: 1,
			series_total: 1,
		});

		expect(normalized.hook).toBe('Only title');
		expect(normalized.post_title).toBe('Only title');
	});
});
