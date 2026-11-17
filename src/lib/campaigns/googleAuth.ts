import { JWT } from 'google-auth-library';

export const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export class GoogleProviderError extends Error {
	code: string;
	status?: number;
	constructor(message: string, code: string, status?: number) {
		super(message);
		this.code = code;
		this.status = status;
	}
}

export type ServiceAccountCredentials = {
	client_email: string;
	private_key: string;
	token_uri?: string;
};

export type GoogleAuthMode = 'service_account' | 'oauth_access' | 'oauth_refresh' | 'none';

export function googleAuthMode(env: Record<string, string | undefined>): GoogleAuthMode {
	if (env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) return 'service_account';
	if (env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN?.trim()) return 'oauth_access';
	if (env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim() && env.GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN?.trim()) return 'oauth_refresh';
	return 'none';
}

export function parseServiceAccount(raw: string | undefined): ServiceAccountCredentials {
	const text = raw?.trim();
	if (!text) throw new GoogleProviderError('GOOGLE_SERVICE_ACCOUNT_JSON is not set.', 'google_credentials_missing');
	let parsed: unknown;
	try {
		const json = text.startsWith('{') ? text : Buffer.from(text, 'base64').toString('utf8');
		parsed = JSON.parse(json);
	} catch {
		throw new GoogleProviderError('GOOGLE_SERVICE_ACCOUNT_JSON is not valid service-account JSON.', 'google_credentials_invalid');
	}
	if (!parsed || typeof parsed !== 'object') {
		throw new GoogleProviderError('GOOGLE_SERVICE_ACCOUNT_JSON is not valid service-account JSON.', 'google_credentials_invalid');
	}
	const record = parsed as Record<string, unknown>;
	const clientEmail = typeof record.client_email === 'string' ? record.client_email.trim() : '';
	const privateKey = typeof record.private_key === 'string' ? record.private_key : '';
	if (!clientEmail.includes('@') || !privateKey.includes('BEGIN PRIVATE KEY')) {
		throw new GoogleProviderError('The service account JSON is missing client_email or private_key.', 'google_credentials_invalid');
	}
	return {
		client_email: clientEmail,
		private_key: privateKey,
		token_uri: typeof record.token_uri === 'string' ? record.token_uri : undefined,
	};
}

export function serviceAccountEmail(env: Record<string, string | undefined>): string | null {
	if (googleAuthMode(env) !== 'service_account') return null;
	try {
		return parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON).client_email;
	} catch {
		return null;
	}
}

function safeGoogleMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : 'Google authentication failed.';
	if (/private_key|BEGIN PRIVATE KEY|GOOGLE_SERVICE_ACCOUNT_JSON/i.test(message)) {
		return 'Google rejected the service account credentials.';
	}
	return message.slice(0, 300);
}

export async function getGoogleAccessToken(input: {
	env: Record<string, string | undefined>;
	scopes: string[];
	fetchImpl?: typeof fetch;
	tokenClient?: { getAccessToken: () => Promise<{ token?: string | null }> };
}): Promise<string> {
	const mode = googleAuthMode(input.env);
	if (mode === 'none') throw new GoogleProviderError('Google credentials are not configured.', 'google_credentials_missing');
	if (mode === 'oauth_access') return input.env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN!.trim();
	if (mode === 'oauth_refresh') {
		const fetchImpl = input.fetchImpl ?? fetch;
		const response = await fetchImpl('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				client_id: input.env.GOOGLE_CLIENT_ID!.trim(),
				client_secret: input.env.GOOGLE_CLIENT_SECRET!.trim(),
				refresh_token: input.env.GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN!.trim(),
				grant_type: 'refresh_token',
			}),
		});
		if (!response.ok) throw new GoogleProviderError(`Google token refresh failed (${response.status}).`, 'google_auth_failed', response.status);
		const body = (await response.json()) as { access_token?: string };
		if (!body.access_token) throw new GoogleProviderError('Google token refresh did not return an access token.', 'google_token_missing');
		return body.access_token;
	}
	const credentials = parseServiceAccount(input.env.GOOGLE_SERVICE_ACCOUNT_JSON);
	const client = input.tokenClient ?? new JWT({
		email: credentials.client_email,
		key: credentials.private_key,
		scopes: input.scopes,
	});
	try {
		const result = await client.getAccessToken();
		if (!result.token) throw new GoogleProviderError('Google did not return an access token.', 'google_token_missing');
		return result.token;
	} catch (error) {
		if (error instanceof GoogleProviderError) throw error;
		throw new GoogleProviderError(safeGoogleMessage(error), 'google_auth_failed');
	}
}
