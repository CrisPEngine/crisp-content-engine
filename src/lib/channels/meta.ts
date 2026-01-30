/**
 * Meta (Instagram + Facebook) channel definition
 * 
 * Shared pipeline at launch.
 * Platform differentiation happens at Airtable record level (Instagram vs Facebook).
 */

import type { ChannelDefinition, ContentDraft } from './types';
import { validateMetaCaption } from './validators';

export const InstagramChannel: ChannelDefinition = {
	id: 'instagram',
	label: 'Instagram',
	airtablePlatformValues: ['Instagram'],
	supportedPostTypes: ['caption'],
	defaultCadence: {
		recommendedPerDay: 0.5, // ~3–4 posts/week
		note: 'Recommended: 3–4 posts per week',
	},
	constraints: {
		maxCharsPerPost: 2200, // Instagram caption limit
		allowsHashtags: true,
		maxHashtags: 15, // Instagram allows up to 30, but 5–15 is recommended
		requiresVisual: false, // Optional for V1
	},

	validate: (draft: ContentDraft) => {
		return validateMetaCaption(draft);
	},

	formatForPreview: (draft: ContentDraft) => {
		return {
			title: draft.hook,
			body: draft.post_content,
			meta: {
				hashtags: draft.hashtags,
				visualBrief: draft.visual_brief,
				platform: 'Instagram',
			},
		};
	},
};

export const FacebookChannel: ChannelDefinition = {
	id: 'facebook',
	label: 'Facebook',
	airtablePlatformValues: ['Facebook'],
	supportedPostTypes: ['caption'],
	defaultCadence: {
		recommendedPerDay: 0.4, // ~3 posts/week
		note: 'Recommended: 3 posts per week',
	},
	constraints: {
		maxCharsPerPost: 63206, // Facebook allows very long posts
		allowsHashtags: true,
		maxHashtags: 10, // Facebook hashtags less important than Instagram
		requiresVisual: false,
	},

	validate: (draft: ContentDraft) => {
		return validateMetaCaption(draft);
	},

	formatForPreview: (draft: ContentDraft) => {
		return {
			title: draft.hook,
			body: draft.post_content,
			meta: {
				hashtags: draft.hashtags,
				visualBrief: draft.visual_brief,
				platform: 'Facebook',
			},
		};
	},
};
