import { authorizationHasReplyScopes } from './scopes';
import { keywordSearchThreadsPosts } from './graphSearch';
import { resolveThreadsTargetPost } from './resolvePostUrl';
import { getAuthorizationSecrets } from '@/lib/social/authorizationSecrets';
import { resolvePublishDestination } from '@/lib/social/resolveDestination';

export type ThreadsReplyAccessDiagnostic = {
	ok: boolean;
	hasDestination: boolean;
	hasReplyScopes: boolean;
	scopes: string[];
	keywordSearchSampleCount: number | null;
	keywordSearchError: string | null;
	resolveTest?: {
		targetUrl?: string;
		mediaId?: string;
		method?: string;
		error?: string;
	};
	notes: string[];
};

export async function diagnoseThreadsReplyAccess(input: {
	userId: string;
	airtableBrandId: string;
	targetUrl?: string;
	authorizationScopes?: string[];
	accessToken?: string;
}): Promise<ThreadsReplyAccessDiagnostic> {
	const notes: string[] = [];
	const destination = await resolvePublishDestination({
		userId: input.userId,
		airtableBrandId: input.airtableBrandId,
		platform: 'Threads',
	});

	let accessToken = input.accessToken;
	let scopes = input.authorizationScopes ?? [];
	if (destination?.authorizationId && !accessToken) {
		const secrets = await getAuthorizationSecrets(destination.authorizationId);
		accessToken = secrets?.accessToken;
	}

	const hasReplyScopes = authorizationHasReplyScopes(scopes);
	if (!hasReplyScopes) {
		notes.push('Reconnect Threads after adding threads_manage_replies and threads_keyword_search in the Meta app.');
	}

	let keywordSearchSampleCount: number | null = null;
	let keywordSearchError: string | null = null;
	if (accessToken && hasReplyScopes) {
		try {
			const sample = await keywordSearchThreadsPosts(accessToken, 'hello', 3);
			keywordSearchSampleCount = sample.length;
			if (sample.length === 0) {
				notes.push('Keyword search returned no rows (common before Advanced Access / App Review for other accounts’ posts).');
			}
		} catch (err) {
			keywordSearchError = err instanceof Error ? err.message : String(err);
		}
	}

	let resolveTest: ThreadsReplyAccessDiagnostic['resolveTest'];
	if (input.targetUrl && accessToken) {
		try {
			const resolved = await resolveThreadsTargetPost({
				targetUrl: input.targetUrl,
				accessToken,
			});
			resolveTest = {
				targetUrl: input.targetUrl,
				mediaId: resolved.mediaId,
				method: resolved.method,
			};
		} catch (err) {
			resolveTest = {
				targetUrl: input.targetUrl,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	const ok = Boolean(destination) && hasReplyScopes && !keywordSearchError;
	return {
		ok,
		hasDestination: Boolean(destination),
		hasReplyScopes,
		scopes,
		keywordSearchSampleCount,
		keywordSearchError,
		resolveTest,
		notes,
	};
}
