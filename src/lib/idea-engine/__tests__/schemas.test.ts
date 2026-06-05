import { describe, expect, it } from 'vitest';
import { ideaEngineChannelResponseSchema, ideaEngineItemSchema } from '../validation/schemas';

describe('ideaEngineItemSchema', () => {
	it('accepts valid item with rich image_prompt', () => {
		const result = ideaEngineItemSchema.safeParse({
			channel: 'LinkedIn',
			post_title: 'Hook line',
			body_draft: 'Full body content here.',
			hashtags: '#test',
			image_prompt: { objective: { primary_intent: 'scroll stop' } },
			series_position: 1,
			series_total: 2,
		});
		expect(result.success).toBe(true);
	});

	it('rejects missing body_draft', () => {
		const result = ideaEngineItemSchema.safeParse({
			channel: 'X',
			post_title: 'Only title',
			series_position: 1,
			series_total: 1,
		});
		expect(result.success).toBe(false);
	});
});

describe('ideaEngineChannelResponseSchema', () => {
	it('accepts channel batch response', () => {
		const result = ideaEngineChannelResponseSchema.safeParse({
			items: [
				{
					channel: 'Blog',
					post_title: 'Title',
					body_draft: 'Article body with enough content.',
					series_position: 1,
					series_total: 1,
				},
			],
		});
		expect(result.success).toBe(true);
	});
});
