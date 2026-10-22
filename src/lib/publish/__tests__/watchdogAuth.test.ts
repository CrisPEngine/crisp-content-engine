import { afterEach, describe, expect, it } from 'vitest';
import { requireWatchdogCronAuth } from '@/lib/publish/watchdogAuth';

describe('requireWatchdogCronAuth', () => {
	const previous = process.env.WATCHDOG_CRON_SECRET;

	afterEach(() => {
		if (previous === undefined) delete process.env.WATCHDOG_CRON_SECRET;
		else process.env.WATCHDOG_CRON_SECRET = previous;
	});

	it('returns 500 when WATCHDOG_CRON_SECRET is unset', () => {
		delete process.env.WATCHDOG_CRON_SECRET;
		const result = requireWatchdogCronAuth(new Request('https://example.com/api/publish/watchdog'));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.status).toBe(500);
	});

	it('accepts Authorization Bearer with constant-time path', () => {
		process.env.WATCHDOG_CRON_SECRET = 'test-watchdog-secret';
		const ok = requireWatchdogCronAuth(
			new Request('https://example.com/api/publish/watchdog', {
				headers: { Authorization: 'Bearer test-watchdog-secret' },
			}),
		);
		expect(ok.ok).toBe(true);

		const bad = requireWatchdogCronAuth(
			new Request('https://example.com/api/publish/watchdog', {
				headers: { Authorization: 'Bearer wrong-secret' },
			}),
		);
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(bad.status).toBe(401);
	});

	it('accepts X-Watchdog-Secret header', () => {
		process.env.WATCHDOG_CRON_SECRET = 'header-secret';
		const ok = requireWatchdogCronAuth(
			new Request('https://example.com/api/publish/watchdog', {
				headers: { 'X-Watchdog-Secret': 'header-secret' },
			}),
		);
		expect(ok.ok).toBe(true);
	});
});
