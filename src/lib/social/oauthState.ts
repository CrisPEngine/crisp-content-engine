import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';

export function createOAuthState(): string {
	return randomBytes(32).toString('hex');
}

export async function setOAuthStateCookie(name: string, state: string, payload?: Record<string, string>) {
	const cookieStore = await cookies();
	const value = payload ? `${state}:${Buffer.from(JSON.stringify(payload)).toString('base64url')}` : state;
	cookieStore.set(name, value, {
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		path: '/',
		maxAge: 600,
	});
}

export async function readAndClearOAuthStateCookie(name: string): Promise<{ state: string; payload: Record<string, string> } | null> {
	const cookieStore = await cookies();
	const raw = cookieStore.get(name)?.value;
	cookieStore.set(name, '', { path: '/', maxAge: 0 });
	if (!raw) return null;
	const colon = raw.indexOf(':');
	if (colon === -1) return { state: raw, payload: {} };
	const state = raw.slice(0, colon);
	try {
		const payload = JSON.parse(Buffer.from(raw.slice(colon + 1), 'base64url').toString('utf8')) as Record<string, string>;
		return { state, payload };
	} catch {
		return { state: raw, payload: {} };
	}
}

export function oauthRedirectBase(): string {
	return process.env.NEXT_PUBLIC_SITE_URL || 'https://app.crispdigital.io';
}
