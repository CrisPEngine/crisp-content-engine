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

describe('buildSidecarDraftMessages', () => {
	it('includes brand voice and engagement context', () => {
		const messages = buildSidecarDraftMessages(profile, {
			brandId: 'recTest',
			platform: 'linkedin',
			selectedText: 'Great post about ops',
			messageType: 'Public reply',
			objective: 'Community value',
			ctaStrength: 'None',
			relationshipStage: 'Cold',
		});

		expect(messages).toHaveLength(2);
		expect(messages[0].role).toBe('system');
		expect(messages[1].content).toContain('CrisP Digital');
		expect(messages[1].content).toContain('Great post about ops');
		expect(messages[1].content).toContain('synergy');
	});
});
