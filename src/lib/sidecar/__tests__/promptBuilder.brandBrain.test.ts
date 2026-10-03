import { describe, expect, it } from 'vitest';
import { buildSidecarDraftMessages } from '../promptBuilder';
import type { SidecarBrandProfile } from '../brands';

const profile: SidecarBrandProfile = {
	id: 'recTest',
	name: 'CrisP Digital',
	status: 'Strategy Ready',
	fields: {
		brand_type: 'company',
		audience: 'Founders',
		voice_rules: 'Direct, helpful',
		exclude_keywords: 'synergy',
	},
};

describe('buildSidecarDraftMessages brand brain', () => {
	it('appends Brand Brain context when provided without dropping Airtable voice rules', () => {
		const messages = buildSidecarDraftMessages(
			profile,
			{
				brandId: 'recTest',
				platform: 'linkedin',
				selectedText: 'Great post about ops',
				messageType: 'Public reply',
				objective: 'Community value',
				ctaStrength: 'None',
				relationshipStage: 'Cold',
			},
			'Voice: calm and precise. Avoid delve.',
		);
		expect(messages[1].content).toContain('Brand Brain');
		expect(messages[1].content).toContain('Avoid delve');
		expect(messages[1].content).toContain('synergy');
	});
});
