import { decodeThreadsShortcodeToMediaId, parseThreadsPostUrl } from './shortcode';
import {
	fetchProfileThreadsPosts,
	keywordSearchThreadsPosts,
	lookupThreadsProfileId,
	permalinkMatchesShortcode,
	type ThreadsMediaSummary,
} from './graphSearch';

export type ThreadsMediaResolutionMethod = 'provided_id' | 'official_profile' | 'official_keyword' | 'shortcode_fallback';

export type ResolvedThreadsTargetPost = {
	targetUrl?: string;
	mediaId: string;
	method: ThreadsMediaResolutionMethod;
	matchedPost?: Pick<ThreadsMediaSummary, 'text' | 'username' | 'permalink'>;
};

export class ThreadsPostResolutionError extends Error {
	constructor(
		message: string,
		public readonly code: 'invalid_url' | 'unresolved' | 'missing_token' = 'unresolved',
	) {
		super(message);
		this.name = 'ThreadsPostResolutionError';
	}
}

function pickFromPosts(posts: ThreadsMediaSummary[], shortcode?: string, username?: string): ThreadsMediaSummary | null {
	if (shortcode) {
		const byPermalink = posts.find((p) => permalinkMatchesShortcode(p.permalink, shortcode));
		if (byPermalink) return byPermalink;
	}
	if (username) {
		const handle = username.replace(/^@/, '').toLowerCase();
		const byUser = posts.find((p) => (p.username ?? '').replace(/^@/, '').toLowerCase() === handle);
		if (byUser && (!shortcode || permalinkMatchesShortcode(byUser.permalink, shortcode))) return byUser;
	}
	return null;
}

export async function resolveThreadsTargetPost(input: {
	targetUrl?: string;
	externalPostId?: string;
	accessToken?: string;
	/** Excerpt or keywords to refine keyword_search when URL shortcode alone is insufficient. */
	searchHint?: string;
}): Promise<ResolvedThreadsTargetPost> {
	const rawId = input.externalPostId?.trim();
	if (rawId && /^\d+$/.test(rawId)) {
		return { mediaId: rawId, method: 'provided_id', targetUrl: input.targetUrl };
	}

	const parsedUrl = input.targetUrl ? parseThreadsPostUrl(input.targetUrl) : null;
	if (input.targetUrl && !parsedUrl) {
		throw new ThreadsPostResolutionError('Target URL must be a threads.net or threads.com post link.', 'invalid_url');
	}

	const shortcode = parsedUrl?.shortcode;
	const username = parsedUrl?.username;
	const normalizedUrl = parsedUrl?.normalizedUrl ?? input.targetUrl;

	if (shortcode && !input.accessToken) {
		const decoded = decodeThreadsShortcodeToMediaId(shortcode);
		if (decoded) {
			return {
				mediaId: decoded,
				method: 'shortcode_fallback',
				targetUrl: normalizedUrl,
			};
		}
	}

	if (!input.accessToken) {
		throw new ThreadsPostResolutionError(
			'Could not resolve the Threads post id. Connect Threads with reply scopes or pass externalPostId.',
			'unresolved',
		);
	}

	const token = input.accessToken;
	let officialMatch: ThreadsMediaSummary | null = null;
	let officialMethod: ThreadsMediaResolutionMethod | null = null;

	if (username) {
		const authorId = await lookupThreadsProfileId(token, username);
		if (authorId) {
			const posts = await fetchProfileThreadsPosts(token, authorId);
			officialMatch = pickFromPosts(posts, shortcode, username);
			if (officialMatch) officialMethod = 'official_profile';
		}
	}

	if (!officialMatch) {
		const queryParts = [shortcode, input.searchHint?.slice(0, 80), username ? `@${username.replace(/^@/, '')}` : '']
			.filter(Boolean)
			.join(' ');
		if (queryParts) {
			const posts = await keywordSearchThreadsPosts(token, queryParts);
			officialMatch = pickFromPosts(posts, shortcode, username);
			if (officialMatch) officialMethod = 'official_keyword';
		}
	}

	if (officialMatch?.id && officialMethod) {
		return {
			mediaId: officialMatch.id,
			method: officialMethod,
			targetUrl: normalizedUrl,
			matchedPost: {
				text: officialMatch.text,
				username: officialMatch.username,
				permalink: officialMatch.permalink,
			},
		};
	}

	if (shortcode) {
		const decoded = decodeThreadsShortcodeToMediaId(shortcode);
		if (decoded) {
			return {
				mediaId: decoded,
				method: 'shortcode_fallback',
				targetUrl: normalizedUrl,
			};
		}
	}

	throw new ThreadsPostResolutionError(
		'Could not resolve a Threads media id for this post. Before App Review, keyword search may only return your own posts.',
		'unresolved',
	);
}
