import { describe, expect, it } from 'vitest';
import { normalizeDraftLlmPayload } from '../normalizeDraftOutput';
import { sidecarDraftOutputSchema } from '../schemas';

describe('normalizeDraftLlmPayload', () => {
	it('coerces snake_case keys and float fitScore', () => {
		const normalized = normalizeDraftLlmPayload({
			draft_text: 'Hello world',
			short_alternative: 'Hi',
			fitScore: 7.8,
			opportunity_summary: 'Good thread',
			recommended_action: 'Reply',
			cta_recommendation: 'Soft mention',
			link_recommendation: 'None',
			risk_notes: '',
			suggested_follow_up: 'Wait',
			suggestedTags: ['community'],
			extraField: 'ignored by normalizer',
		});

		const parsed = sidecarDraftOutputSchema.safeParse(normalized);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.fitScore).toBe(8);
			expect(parsed.data.draftText).toBe('Hello world');
		}
	});
});
