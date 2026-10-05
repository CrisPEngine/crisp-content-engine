import type { ChannelDefinition, ContentDraft } from './types';

export const ThreadsChannel: ChannelDefinition = {
	id: 'threads',
	label: 'Threads',
	airtablePlatformValues: ['Threads'],
	supportedPostTypes: ['single'],
	defaultCadence: {
		recommendedPerDay: 1,
		note: 'Conversational posts; not a copy-paste of Instagram captions.',
	},
	constraints: {
		maxCharsPerPost: 500,
		allowsHashtags: true,
		maxHashtags: 5,
	},
	validate(draft: ContentDraft) {
		const len = (draft.post_content || '').length;
		if (len > 500) {
			return { ok: false, errors: [{ code: 'too_long', message: 'Threads posts must be 500 characters or fewer.', severity: 'block' }] };
		}
		if (!draft.post_content?.trim()) {
			return { ok: false, errors: [{ code: 'empty', message: 'Threads post content is required.', severity: 'block' }] };
		}
		return { ok: true };
	},
	formatForPreview(draft: ContentDraft) {
		return {
			title: draft.hook || undefined,
			body: draft.post_content,
			meta: { platform: 'Threads' },
		};
	},
};
