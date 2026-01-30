/**
 * LinkedIn channel definition
 * 
 * Defines constraints, validation, and formatting for LinkedIn content.
 */

import type { ChannelDefinition, ContentDraft } from './types';
import { validateLinkedInSingle } from './validators';

export const LinkedInChannel: ChannelDefinition = {
	id: 'linkedin',
	label: 'LinkedIn',
	airtablePlatformValues: ['LinkedIn'],
	supportedPostTypes: ['single'],
	defaultCadence: {
		recommendedPerDay: 0.4, // ~3 posts/week
		note: 'Recommended: 3 posts per week (Mon/Wed/Fri)',
	},
	constraints: {
		minCharsPerPost: 50,
		maxCharsPerPost: 3000, // LinkedIn allows up to 3000 chars
		allowsHashtags: true,
		maxHashtags: 10,
	},

	validate: (draft: ContentDraft) => {
		return validateLinkedInSingle(draft);
	},

	formatForPreview: (draft: ContentDraft) => {
		return {
			title: draft.hook,
			body: draft.post_content,
			meta: {
				hashtags: draft.hashtags,
				platform: 'LinkedIn',
			},
		};
	},
};
