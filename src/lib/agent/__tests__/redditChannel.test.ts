import { describe, expect, it } from 'vitest';
import { channelCatalog } from '@/lib/agent/channels';
import { draftOnlyChannelsForMcp } from '@/lib/social/brandChannels';
import { assertRedditManualPublishOnly } from '@/lib/channels/redditPolicy';
import { AgentError } from '@/lib/agent/errors';

describe('Reddit draft-only channel', () => {
	it('appears in capabilities catalog as draft_only / manual_publish', () => {
		const reddit = channelCatalog().find((row) => row.id === 'REDDIT');
		expect(reddit).toMatchObject({
			publishMode: 'draft_only',
			manualPublish: true,
			capabilities: expect.objectContaining({ publish: 'NOT_IMPLEMENTED' }),
		});
	});

	it('includes Reddit in brand channel destinations summary', () => {
		const reddit = draftOnlyChannelsForMcp().find((row) => row.channel === 'Reddit');
		expect(reddit).toMatchObject({
			status: 'DRAFT_ONLY',
			canPublish: false,
			publishMode: 'draft_only',
			manualPublish: true,
			destination: null,
		});
	});

	it('blocks schedule actions for Reddit', () => {
		expect(() =>
			assertRedditManualPublishOnly({
				channel: 'reddit',
				requestedAction: 'approve_and_schedule',
				publishAt: '2026-10-12T09:00:00.000Z',
			}),
		).toThrow(AgentError);
	});
});
