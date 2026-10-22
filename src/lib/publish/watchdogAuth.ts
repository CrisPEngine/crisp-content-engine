import { timingSafeEqual } from 'crypto';

export type WatchdogCronAuthResult =
	| { ok: true }
	| { ok: false; status: 401 | 500; error: string };

function readWatchdogSecretFromRequest(request: Request): string | null {
	const authHeader = request.headers.get('authorization');
	if (authHeader) {
		const match = authHeader.match(/^Bearer\s+(.+)$/i);
		if (match?.[1]) return match[1].trim();
	}
	const headerSecret = request.headers.get('x-watchdog-secret')?.trim();
	if (headerSecret) return headerSecret;
	return null;
}

function secretsMatch(expected: string, provided: string): boolean {
	const expectedBuf = Buffer.from(expected, 'utf8');
	const providedBuf = Buffer.from(provided, 'utf8');
	if (expectedBuf.length !== providedBuf.length) {
		return false;
	}
	return timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Authenticate publish watchdog requests (cron-job.org).
 * Uses WATCHDOG_CRON_SECRET only (separate from CRON_SECRET used by publish workers).
 */
export function requireWatchdogCronAuth(request: Request): WatchdogCronAuthResult {
	const expected = process.env.WATCHDOG_CRON_SECRET?.trim();
	if (!expected) {
		return { ok: false, status: 500, error: 'Watchdog not configured' };
	}
	const provided = readWatchdogSecretFromRequest(request);
	if (!provided) {
		return { ok: false, status: 401, error: 'Unauthorized' };
	}
	if (!secretsMatch(expected, provided)) {
		return { ok: false, status: 401, error: 'Unauthorized' };
	}
	return { ok: true };
}
