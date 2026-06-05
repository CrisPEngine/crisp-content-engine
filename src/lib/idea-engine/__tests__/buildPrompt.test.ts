import { describe, expect, it } from 'vitest';
import { buildIdeaEnginePrompt } from '../generator/buildPrompt';
import type { IdeaEngineRunContext } from '../types';

const baseContext: IdeaEngineRunContext = {
	seriesRunId: '550e8400-e29b-41d4-a716-446655440000',
	runId: '660e8400-e29b-41d4-a716-446655440001',
	userId: '770e8400-e29b-41d4-a716-446655440002',
	plan: 'growth',
	brandProfileId: 'recTest',
	idea: 'Why founders struggle with content consistency.',
	goal: 'Engagement',
	notes: 'Include systems angle.',
	selectedChannels: ['LinkedIn', 'X'],
	publishMode: 'queue_only',
	requestedCounts: { LinkedIn: 2, X: 2 },
	quotaRemainingByChannel: { linkedin: 10, x: 8, blog: 2, meta_pool: 5 },
	autopublishCapabilities: { linkedin: true, instagram: true, facebook: true, x: false, blog: false },
	timezone: 'Asia/Dubai',
	postingWindows: null,
	brandContext: {
		client_name: 'CrisP Digital',
		voice_rules: 'No em dash',
		audience: 'Founders',
		offers: 'Strategy sprint',
		strategy_json: '{"pillars":["systems"]}',
	},
	previousContentJson: [{ 'Post Title': 'Old post', Platform: 'LinkedIn' }],
};

describe('buildIdeaEnginePrompt', () => {
	it('includes idea, brand context, dedup history, and channel instructions', () => {
		const messages = buildIdeaEnginePrompt(baseContext, {
			channel: 'LinkedIn',
			itemCount: 2,
			seriesRunId: baseContext.seriesRunId,
		});

		expect(messages).toHaveLength(2);
		expect(messages[0]?.role).toBe('system');
		expect(messages[1]?.role).toBe('user');

		const user = messages[1]?.content ?? '';
		expect(user).toContain(baseContext.idea);
		expect(user).toContain('CrisP Digital');
		expect(user).toContain('Old post');
		expect(user).toContain('LinkedIn');
		expect(user).toContain('Items to generate: 2');
		expect(user).toContain('series_position from 1 to 2');
		expect(user).toContain('RICH image_prompt');
		expect(user).toContain('Promotional balance');
		expect(user).toContain('Strategy sprint');
	});

	it('supports batched channel generation with correct series positions', () => {
		const messages = buildIdeaEnginePrompt(baseContext, {
			channel: 'LinkedIn',
			itemCount: 2,
			seriesRunId: baseContext.seriesRunId,
			seriesPositionStart: 4,
			seriesTotalForChannel: 5,
		});
		const user = messages[1]?.content ?? '';
		expect(user).toContain('series_total=5');
		expect(user).toContain('series_position from 4 to 5');
	});

	it('uses SIMPLE image prompt for X', () => {
		const messages = buildIdeaEnginePrompt(baseContext, {
			channel: 'X',
			itemCount: 1,
			seriesRunId: baseContext.seriesRunId,
		});
		const user = messages[1]?.content ?? '';
		expect(user).toContain('SIMPLE image_prompt');
	});
});
