import { NextResponse } from 'next/server';
import { requireWatchdogCronAuth } from '@/lib/publish/watchdogAuth';
import { runPublishWatchdog } from '@/lib/publish/publishWatchdogRun';
import { recordPublishWorkerRun } from '@/lib/publish/workerHeartbeat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Independent publish watchdog (external cron only). Detects silent schedulers and marks
 * posts that missed their publish window without double posting.
 */
export async function GET(request: Request) {
	try {
		const auth = requireWatchdogCronAuth(request);
		if (!auth.ok) {
			if (auth.status === 401) console.warn('[Publish Watchdog] Unauthorized cron request');
			else console.error('[Publish Watchdog] WATCHDOG_CRON_SECRET not configured');
			return NextResponse.json({ error: auth.error }, { status: auth.status });
		}

		const result = await runPublishWatchdog();
		return NextResponse.json(result);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Watchdog failed';
		await recordPublishWorkerRun({ worker: 'publish-watchdog', ok: false, error: message });
		console.error('[Publish Watchdog]', message);
		return NextResponse.json({ ok: false, error: message }, { status: 500 });
	}
}

export async function POST(request: Request) {
	return GET(request);
}
