import { authorizeCron } from '@/lib/intelligence/http';

export type PublishCronAuthResult =
	| { ok: true; cronSecret: string }
	| { ok: false; status: 401 | 500; error: string };

/**
 * Authenticate publish worker cron requests.
 * Accepts Authorization: Bearer and X-Cron-Secret (same as intelligence jobs).
 */
export function requirePublishCronAuth(request: Request): PublishCronAuthResult {
	const cronSecret = process.env.CRON_SECRET?.trim();
	if (!cronSecret) {
		return { ok: false, status: 500, error: 'Worker not configured' };
	}
	if (!authorizeCron(request)) {
		return { ok: false, status: 401, error: 'Unauthorized' };
	}
	return { ok: true, cronSecret };
}
