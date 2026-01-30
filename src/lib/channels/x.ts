/**
 * X (Twitter) channel definition
 * 
 * Defines constraints, validation, and formatting for X content.
 * 
 * V1 constraint: threads are export-only (no scheduling/publishing).
 */

import type { ChannelDefinition, ContentDraft } from './types';
import { validateXSingle, validateXThread } from './validators';

export const XChannel: ChannelDefinition = {
	id: 'x',
	label: 'X',
	airtablePlatformValues: ['X'],
	supportedPostTypes: ['single', 'thread'],
	defaultCadence: {
		recommendedPerDay: 2,
		note: 'Recommended: 2 posts per day (morning + afternoon)',
	},
	constraints: {
		maxCharsPerPost: 280,
		minCharsPerPost: 10,
		maxThreadLength: 5,
		minThreadLength: 2,
		allowsHashtags: true,
		maxHashtags: 2, // X users typically use 0–2 hashtags
	},

	validate: (draft: ContentDraft) => {
		if (draft.post_type === 'thread') {
			return validateXThread(draft);
		}
		return validateXSingle(draft);
	},

	formatForPreview: (draft: ContentDraft) => {
		return {
			title: draft.hook,
			body: draft.post_content,
			meta: {
				charCount: draft.post_content.length,
				isThread: draft.post_type === 'thread',
				threadIndex: draft.thread_index,
				platform: 'X',
			},
		};
	},
};
