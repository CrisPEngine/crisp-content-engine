import { describe, expect, it } from 'vitest';
import { sidecarDraftOutputSchema, sidecarDraftRequestSchema } from '../schemas';

describe('sidecarDraftRequestSchema', () => {
	it('requires brandId or brand', () => {
		const result = sidecarDraftRequestSchema.safeParse({
			platform: 'linkedin',
			messageType: 'Public reply',
			objective: 'Brand awareness',
			ctaStrength: 'Soft',
			relationshipStage: 'Unknown',
		});
		expect(result.success).toBe(false);
	});

	it('accepts brandId', () => {
		const result = sidecarDraftRequestSchema.safeParse({
			brandId: 'rec123',
			platform: 'linkedin',
			messageType: 'Public reply',
			objective: 'Brand awareness',
			ctaStrength: 'Soft',
			relationshipStage: 'Unknown',
		});
		expect(result.success).toBe(true);
	});
});

describe('sidecarDraftOutputSchema', () => {
	it('validates complete output', () => {
		const result = sidecarDraftOutputSchema.safeParse({
			draftText: 'Hello',
			shortAlternative: 'Hi',
			fitScore: 7,
			opportunitySummary: 'Good fit',
			recommendedAction: 'Reply',
			ctaRecommendation: 'None',
			linkRecommendation: 'No link',
			riskNotes: '',
			suggestedFollowUp: 'Check in next week',
			suggestedTags: ['community'],
		});
		expect(result.success).toBe(true);
	});
});
