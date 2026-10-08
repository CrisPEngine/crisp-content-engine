import 'server-only';

import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { resolvePublishDestination } from '@/lib/social/resolveDestination';
import { accessTokenForResolvedDestination } from '@/lib/social/accessTokenForPublish';
import { publishThreadsPost } from '@/lib/threads/oauth';
import { AgentError } from '@/lib/agent/errors';
import type { CommunityInteraction } from '@/lib/agent/types';

export type ThreadsReplyPublishResult = {
	success: boolean;
	replyPostId?: string;
	permalink?: string;
	error?: string;
};

function buildPermalink(username: string | undefined, replyPostId: string): string | undefined {
	if (!username) return undefined;
	const handle = username.replace(/^@/, '');
	return `https://www.threads.net/@${handle}/post/${replyPostId}`;
}

export async function publishApprovedThreadsReply(input: {
	ownerUserId: string;
	brandId: string;
	interaction: CommunityInteraction;
}): Promise<ThreadsReplyPublishResult> {
	const replyToId = input.interaction.resolvedMediaId ?? input.interaction.externalPostId;
	const text = input.interaction.draftReply?.trim();
	if (!replyToId || !/^\d+$/.test(replyToId)) {
		throw new AgentError('invalid_input', 'Threads reply target media id is missing or invalid.', 400);
	}
	if (!text) {
		throw new AgentError('invalid_input', 'Reply text is empty.', 400);
	}

	const intelligence = getIntelligenceStore();
	const brain = await intelligence.getBrandBrainById(input.ownerUserId, input.brandId);
	if (!brain?.airtableBrandId) {
		throw new AgentError('not_found', 'Brand brain not found for Threads publish.', 404);
	}

	const destination = await resolvePublishDestination({
		userId: input.ownerUserId,
		airtableBrandId: brain.airtableBrandId,
		platform: 'Threads',
	});
	if (!destination || destination.channel !== 'threads') {
		throw new AgentError('publish_destination_missing', 'No Threads destination is connected for this brand.', 409);
	}

	const access = await accessTokenForResolvedDestination(input.ownerUserId, destination);
	if (!access?.accessToken) {
		throw new AgentError('publish_auth_missing', 'Threads access token is missing. Reconnect Threads in Connections.', 409);
	}

	const result = await publishThreadsPost({
		threadsUserId: access.providerUserId,
		accessToken: access.accessToken,
		text,
		replyToId,
	});

	if (!result.success) {
		return { success: false, error: result.error ?? 'Threads reply publish failed' };
	}

	const permalink = buildPermalink(destination.handle ?? undefined, result.postId ?? '');
	return { success: true, replyPostId: result.postId, permalink };
}
