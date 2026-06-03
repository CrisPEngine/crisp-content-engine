import 'server-only';

import { SidecarError } from './errors';

const RATE_WINDOW_MS = 60_000;
const DRAFT_RATE_MAX = 10;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function getClientIp(request: Request): string {
	const forwarded = request.headers.get('x-forwarded-for');
	if (forwarded) {
		return forwarded.split(',')[0]?.trim() || 'unknown';
	}
	return request.headers.get('x-real-ip') || 'unknown';
}

export function enforceSidecarDraftRateLimit(key: string): void {
	const now = Date.now();
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
		return;
	}
	if (bucket.count >= DRAFT_RATE_MAX) {
		throw new SidecarError('Rate limit exceeded. Try again in a minute.', {
			status: 429,
			code: 'sidecar_rate_limit_exceeded',
		});
	}
	bucket.count += 1;
}
