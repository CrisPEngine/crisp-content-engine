import { describe, expect, it } from 'vitest';
import { mergeImageBrief, emptyImageBrief } from '@/lib/articles/imageBrief';
import { isPlaceholderAltText, resolveAssetAltText } from '@/lib/media/altText';

describe('image brief persistence and alt pipeline', () => {
	it('preserves manually edited prompts across merges unless replaced', () => {
		const current = emptyImageBrief('hero');
		current.prompt = 'Manual constraint: keep hands out of frame';
		current.promptManuallyEdited = true;
		const merged = mergeImageBrief(current, { concept: 'Updated café scene with laptop' }, 'hero');
		expect(merged.prompt).toContain('Manual constraint');
		expect(merged.promptManuallyEdited).toBe(true);
		expect(merged.concept).toBe('Updated café scene with laptop');
	});

	it('does not promote instructional directions into alt text', () => {
		expect(
			resolveAssetAltText({
				altTextDirection: 'Describe the hero image accurately for accessibility.',
				concept: 'Writer in a café',
			}),
		).toBe('');
		expect(isPlaceholderAltText('Describe the hero image accurately for accessibility.')).toBe(true);
	});

	it('keeps history entries when merging candidates', () => {
		const current = emptyImageBrief('og');
		current.history = [
			{
				at: '2026-01-01T00:00:00.000Z',
				prompt: 'a',
				concept: 'a',
				assetId: 'old',
				url: 'https://example.com/old.jpg',
				reused: false,
				estimatedCostUsd: 0.04,
			},
		];
		const merged = mergeImageBrief(current, { concept: 'b' }, 'og');
		expect(merged.history).toHaveLength(1);
		expect(merged.history[0]?.assetId).toBe('old');
	});
});
