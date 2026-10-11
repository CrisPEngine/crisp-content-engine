/**
 * Reddit channel (draft-only / manual publish).
 * No Reddit API integration — owners post by hand after approval.
 */

import type { ChannelDefinition, ContentDraft } from './types';
import { validateRedditPost } from './validators';

export const REDDIT_TITLE_MAX_CHARS = 300;

export type RedditPostFields = {
	subreddit: string;
	title: string;
	body: string;
	linkUrl?: string;
	flairText?: string;
};

export type RedditMemoryMetadata = {
	subreddit: string;
	linkUrl?: string;
	flairText?: string;
};

export function normalizeSubreddit(value: string | undefined): string {
	return (value ?? '').trim().replace(/^r\//i, '');
}

export function redditFieldsFromMemory(memory: {
	hook?: string;
	body?: string;
	metadata?: Record<string, unknown>;
}): RedditPostFields | null {
	const raw = memory.metadata?.reddit;
	if (!raw || typeof raw !== 'object') return null;
	const meta = raw as RedditMemoryMetadata;
	const subreddit = normalizeSubreddit(meta.subreddit);
	if (!subreddit) return null;
	return {
		subreddit,
		title: (memory.hook ?? '').trim(),
		body: (memory.body ?? '').trim(),
		linkUrl: typeof meta.linkUrl === 'string' ? meta.linkUrl.trim() : undefined,
		flairText: typeof meta.flairText === 'string' ? meta.flairText.trim() : undefined,
	};
}

export function isRedditPipelineChannel(channel: string | undefined): boolean {
	return String(channel ?? '').toLowerCase() === 'reddit';
}

export function redditSubmitUrl(subreddit: string, title: string): string {
	const sub = normalizeSubreddit(subreddit);
	const params = new URLSearchParams();
	if (title.trim()) params.set('title', title.trim());
	const query = params.toString();
	return query
		? `https://www.reddit.com/r/${encodeURIComponent(sub)}/submit?${query}`
		: `https://www.reddit.com/r/${encodeURIComponent(sub)}/submit`;
}

export const RedditChannel: ChannelDefinition = {
	id: 'reddit',
	label: 'Reddit',
	airtablePlatformValues: ['Reddit'],
	supportedPostTypes: ['single'],
	defaultCadence: {
		recommendedPerDay: 0.1,
		note: 'Community-first: a few valuable posts beat frequent self-promotion.',
	},
	constraints: {
		maxCharsPerPost: 40_000,
		allowsHashtags: false,
	},
	validate: (draft: ContentDraft) => validateRedditPost(draft),
	formatForPreview: (draft: ContentDraft) => ({
		title: draft.hook,
		body: draft.post_content,
		meta: {
			platform: 'Reddit',
			subreddit: draft.reddit?.subreddit,
			linkUrl: draft.reddit?.linkUrl,
			flairText: draft.reddit?.flairText,
			titleLength: (draft.hook || '').length,
		},
	}),
};
