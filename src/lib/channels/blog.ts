/**
 * Blog channel definition
 * 
 * Included for plan parity and quota counting.
 * Focus is copy/export rather than publishing in V1.
 */

import type { ChannelDefinition, ContentDraft } from './types';
import { validateBlogPost } from './validators';

export const BlogChannel: ChannelDefinition = {
	id: 'blog',
	label: 'Blog',
	airtablePlatformValues: ['Blog'],
	supportedPostTypes: ['single'],
	defaultCadence: {
		recommendedPerDay: 0.14, // ~1 post/week
		note: 'Recommended: 1 long-form post per week',
	},
	constraints: {
		minCharsPerPost: 300,
		maxCharsPerPost: 10000,
		allowsHashtags: false,
	},

	validate: (draft: ContentDraft) => {
		return validateBlogPost(draft);
	},

	formatForPreview: (draft: ContentDraft) => {
		return {
			title: draft.hook,
			body: draft.post_content,
			meta: {
				platform: 'Blog',
				wordCount: Math.round((draft.post_content || '').split(/\s+/).length),
			},
		};
	},
};
