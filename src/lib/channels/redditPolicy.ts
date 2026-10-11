import { AgentError } from '@/lib/agent/errors';
import { isRedditPipelineChannel } from './reddit';

export function assertRedditManualPublishOnly(input: {
	channel: string;
	requestedAction?: string;
	publishAt?: string | null;
}): void {
	if (!isRedditPipelineChannel(input.channel)) return;
	if (input.requestedAction === 'approve_and_schedule' || input.publishAt) {
		throw new AgentError(
			'content_channel_constraint',
			'Reddit is draft-only. Submit for content approval only; post manually on Reddit after approval.',
			400,
			{ channel: 'reddit', publishMode: 'draft_only', manualPublish: true },
		);
	}
}
