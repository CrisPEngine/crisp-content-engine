import { NextResponse } from 'next/server';
import { runProductionSmoke } from '@/lib/intelligence/diagnostics';
import { jsonError, requireIntelligenceUserOrCron } from '@/lib/intelligence/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
	try {
		await requireIntelligenceUserOrCron(request);
		const smoke = await runProductionSmoke();
		return NextResponse.json({
			ok: smoke.ok,
			failedCritical: smoke.failedCritical,
			checks: smoke.checks.map((check) => ({
				id: check.id,
				ok: check.ok,
				severity: check.severity,
				detail: check.detail,
			})),
		});
	} catch (error) {
		const mapped = jsonError(error);
		return NextResponse.json(mapped.body, { status: mapped.status });
	}
}
