import type { LlmMessage } from '@/lib/llm';
import { briefToWriterContext } from './brief';
import type { ContentBrief } from './types';
import { REDDIT_TITLE_MAX_CHARS, normalizeSubreddit } from '@/lib/channels/reddit';
import { sanitizeText } from '@/lib/content/dashSanitizer';

export type RedditGeneratedDraft = {
	title?: string;
	body?: string;
	subreddit?: string;
	linkUrl?: string;
	flairText?: string;
	topic?: string;
};

export function redditWriterMessages(contextPrompt: string, brief: ContentBrief, userIntent: string): LlmMessage[] {
	return [
		{
			role: 'system',
			content: [
				'You write Reddit posts for this brand as a community member, not as marketing.',
				'Rules:',
				'- Community-first: teach, discuss, or share a genuine insight; the title must carry the value.',
				'- Self-promotion: stay near the ~10% norm — most posts should not pitch the product.',
				'- No marketing tone, hype, or “we’re excited to announce”.',
				'- When the post mentions the founder’s own product, say plainly that it is theirs (transparency).',
				'- Respect subreddit culture; avoid spam patterns and respect stated rules in the brief.',
				`- Title max ${REDDIT_TITLE_MAX_CHARS} characters.`,
				'- Never use em dash (—) or en dash as punctuation in title or body.',
				'- Body: markdown suitable for a text self-post (paragraphs, lists, code blocks if useful).',
				'- linkUrl: optional https URL for a link post instead of/in addition to body (usually omit for discussion posts).',
				'- flairText: optional subreddit flair label if the brief names one.',
				'- subreddit: target community without "r/" prefix.',
				'Return JSON only:',
				'{ "title": string, "body": string, "subreddit": string, "linkUrl"?: string, "flairText"?: string, "topic": string }',
			].join('\n'),
		},
		{
			role: 'user',
			content: [
				'## User intent',
				userIntent,
				'',
				'## Structured brief',
				briefToWriterContext(brief),
				'',
				'## Retrieved context',
				contextPrompt,
			].join('\n'),
		},
	];
}

export function redditDraftFromGenerated(generated: RedditGeneratedDraft): {
	title: string;
	body: string;
	metadata: { reddit: { subreddit: string; linkUrl?: string; flairText?: string } };
	topic: string;
} {
	const title = sanitizeText((generated.title || '').trim());
	const body = sanitizeText((generated.body || '').trim());
	const subreddit = normalizeSubreddit(generated.subreddit);
	const linkUrl = typeof generated.linkUrl === 'string' ? generated.linkUrl.trim() : undefined;
	const flairText = typeof generated.flairText === 'string' ? generated.flairText.trim() : undefined;
	return {
		title,
		body,
		topic: (generated.topic || title || briefFallback(generated)).trim(),
		metadata: {
			reddit: {
				subreddit,
				...(linkUrl ? { linkUrl } : {}),
				...(flairText ? { flairText } : {}),
			},
		},
	};
}

function briefFallback(generated: RedditGeneratedDraft): string {
	return generated.title || 'Reddit post';
}
