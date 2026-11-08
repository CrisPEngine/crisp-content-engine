import { lookup } from 'dns/promises';
import { isPrivateAddress } from '@/lib/research/policy';

export class UnsafeDestinationUrlError extends Error {}

/**
 * Accepts only https URLs without embedded credentials whose host resolves exclusively to public addresses.
 * Run this before every request to a user-supplied destination, not only when it is saved, because DNS can change.
 */
export async function assertSafeDestinationUrl(value: string, resolve: typeof lookup = lookup): Promise<URL> {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new UnsafeDestinationUrlError('Enter a valid URL.');
	}
	if (url.protocol !== 'https:') throw new UnsafeDestinationUrlError('The CMS URL must use https.');
	if (url.username || url.password) throw new UnsafeDestinationUrlError('Do not put credentials in the URL. Use the API key field.');
	if (url.port && url.port !== '443') throw new UnsafeDestinationUrlError('Only the default https port is allowed.');
	const host = url.hostname.toLowerCase();
	if (isPrivateAddress(host) || !host.includes('.')) throw new UnsafeDestinationUrlError('That host is not a public address.');
	let addresses: Array<{ address: string }>;
	try {
		addresses = await resolve(host, { all: true });
	} catch {
		throw new UnsafeDestinationUrlError(`The host ${host} could not be resolved.`);
	}
	const privateAddress = (address: string) => isPrivateAddress(address) || (address.startsWith('::ffff:') && isPrivateAddress(address.slice(7)));
	if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) {
		throw new UnsafeDestinationUrlError(`The host ${host} resolves to a private address.`);
	}
	return url;
}

export function normaliseBaseUrl(value: string): string {
	const url = new URL(value.trim());
	url.hash = '';
	url.search = '';
	return url.toString().replace(/\/+$/, '');
}

/** Fetch for destination APIs: validated host, no redirects, bounded time. */
export async function destinationFetch(
	url: string,
	init: RequestInit & { timeoutMs?: number } = {},
	resolve?: typeof lookup,
): Promise<Response> {
	await assertSafeDestinationUrl(url, resolve);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000);
	try {
		const response = await fetch(url, { ...init, redirect: 'manual', signal: controller.signal, cache: 'no-store' });
		if (response.status >= 300 && response.status < 400) {
			throw new UnsafeDestinationUrlError(`The CMS redirected the request (${response.status}). Use the final API URL.`);
		}
		return response;
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') throw new Error('The CMS did not respond in time.');
		throw error;
	} finally {
		clearTimeout(timer);
	}
}
