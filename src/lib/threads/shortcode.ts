/**
 * Instagram-style base64 shortcode → numeric media id.
 * UNOFFICIAL: Meta does not document this mapping for Threads permalinks.
 * Used only when official Graph lookups fail; callers must record resolution method.
 */
const SHORTCODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function decodeThreadsShortcodeToMediaId(shortcode: string): string | null {
	const trimmed = shortcode.trim();
	if (!trimmed || trimmed.length > 64) return null;
	let id = BigInt(0);
	for (const char of trimmed) {
		const index = SHORTCODE_ALPHABET.indexOf(char);
		if (index < 0) return null;
		id = id * BigInt(64) + BigInt(index);
	}
	if (id <= BigInt(0)) return null;
	return id.toString(10);
}

export function parseThreadsPostUrl(url: string): { username?: string; shortcode?: string; normalizedUrl: string } | null {
	let parsed: URL;
	try {
		parsed = new URL(url.trim());
	} catch {
		return null;
	}
	const host = parsed.hostname.replace(/^www\./, '');
	if (host !== 'threads.net' && host !== 'threads.com') return null;
	const parts = parsed.pathname.split('/').filter(Boolean);
	// /@user/post/SHORTCODE or /t/SHORTCODE
	let username: string | undefined;
	let shortcode: string | undefined;
	if (parts[0]?.startsWith('@')) {
		username = parts[0].slice(1);
		if (parts[1] === 'post' && parts[2]) shortcode = parts[2];
	} else if (parts[0] === 't' && parts[1]) {
		shortcode = parts[1];
	}
	if (!shortcode && !username) return null;
	parsed.hash = '';
	parsed.search = '';
	return { username, shortcode, normalizedUrl: parsed.toString() };
}
