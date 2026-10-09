import type { ContentMemoryRecord } from '@/lib/intelligence/types';
import { AgentError } from '@/lib/agent/errors';
import { CHANNELS } from './registry';
import type { ChannelId, ContentDraft, PostType, ValidationError } from './types';

export function memoryToContentDraft(memory: Pick<ContentMemoryRecord, 'channel' | 'contentType' | 'body' | 'hook'>): ContentDraft {
	const postType: PostType = memory.contentType === 'thread' ? 'thread' : 'single';
	return {
		platform: memory.channel,
		post_type: postType,
		hook: memory.hook || '',
		post_content: memory.body || '',
	};
}

export function validateMemoryChannelConstraints(
	memory: Pick<ContentMemoryRecord, 'channel' | 'contentType' | 'body' | 'hook'>,
): { ok: true } | { ok: false; errors: ValidationError[] } {
	const channelId = String(memory.channel).toLowerCase() as ChannelId;
	const channel = CHANNELS[channelId];
	if (!channel) return { ok: true };
	return channel.validate(memoryToContentDraft(memory));
}

export function assertMemoryChannelConstraints(
	memory: Pick<ContentMemoryRecord, 'channel' | 'contentType' | 'body' | 'hook'>,
): void {
	const result = validateMemoryChannelConstraints(memory);
	if (result.ok) return;
	const blocking = result.errors.find((error) => error.severity === 'block') ?? result.errors[0];
	throw new AgentError(
		'content_channel_constraint',
		blocking?.message ?? 'Content does not meet channel constraints.',
		400,
		{
			constraintCode: blocking?.code,
			channel: memory.channel,
			charCount: (memory.body || '').length,
		},
	);
}
