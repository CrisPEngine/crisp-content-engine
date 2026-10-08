import { createHash } from 'crypto';
import type { CommunityInteraction } from '@/lib/agent/types';

export function fingerprintReplyDraft(
	interaction: Pick<CommunityInteraction, 'draftReply' | 'resolvedMediaId' | 'externalPostId' | 'targetUrl'>,
): string {
	return createHash('sha256')
		.update(
			JSON.stringify({
				draftReply: interaction.draftReply ?? '',
				resolvedMediaId: interaction.resolvedMediaId ?? '',
				externalPostId: interaction.externalPostId ?? '',
				targetUrl: interaction.targetUrl ?? '',
			}),
		)
		.digest('hex');
}
