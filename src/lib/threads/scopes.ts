/** OAuth scopes requested for Threads connections in CCE. */
export const THREADS_OAUTH_SCOPES = [
	'threads_basic',
	'threads_content_publish',
	'threads_manage_replies',
	'threads_keyword_search',
	'threads_read_replies',
] as const;

export function threadsOAuthScopeString(): string {
	return THREADS_OAUTH_SCOPES.join(',');
}

export function authorizationHasReplyScopes(scopes: string[] | undefined | null): boolean {
	const set = new Set((scopes ?? []).map((s) => s.trim()));
	return (
		set.has('threads_content_publish') &&
		set.has('threads_manage_replies') &&
		set.has('threads_keyword_search')
	);
}
