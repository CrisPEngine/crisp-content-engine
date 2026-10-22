import { describe, expect, it } from 'vitest';
import { brandAssetCardHeadline } from '../brandAssetDisplay';

describe('brandAssetCardHeadline', () => {
	it('extracts Folian-style quoted headline from long generation title', () => {
		const title =
			"A single 4:5 image that makes “Instagram 4:5 split layout exactly like Folian reference format. Left half: cream panel, large serif headline reading exactly 'When readers disagree.' then small caps";
		expect(brandAssetCardHeadline({ title })).toBe('When readers disagree.');
	});

	it('prefers vision summary when present', () => {
		expect(
			brandAssetCardHeadline({
				title: 'Very long unused title',
				visionAnalysis: { summary: 'Library desk with two manuscripts' },
			}),
		).toBe('Library desk with two manuscripts');
	});
});
