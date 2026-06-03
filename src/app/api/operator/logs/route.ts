import { NextResponse } from 'next/server';
import { requireOperatorAuth } from '@/lib/operator/auth';
import { assertOperatorConsoleEnabled } from '@/lib/operator/enabled';
import { OperatorActionError } from '@/lib/operator/actions/errors';
import { listOperatorActionLogs } from '@/lib/operator/actions/logger';
import { fetchOperatorLogsInputSchema } from '@/lib/operator/actions/schemas';
import { assertActorCanRunAction } from '@/lib/operator/actions/permissions';
import { enforceOperatorRateLimit } from '@/lib/operator/actions/rateLimit';

export const runtime = 'nodejs';

function sourceIpFromHeaders(request: Request) {
	const forwardedFor = request.headers.get('x-forwarded-for');
	if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || null;
	return request.headers.get('x-real-ip');
}

export async function GET(request: Request) {
	try {
		assertOperatorConsoleEnabled();
		const actor = await requireOperatorAuth(request);
		assertActorCanRunAction(actor, 'fetch_operator_logs');
		await enforceOperatorRateLimit({
			action: 'fetch_operator_logs',
			actor,
			sourceIp: sourceIpFromHeaders(request),
		});

		const { searchParams } = new URL(request.url);
		const input = fetchOperatorLogsInputSchema.parse({
			action: searchParams.get('action') || undefined,
			status: searchParams.get('status') || undefined,
			limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
		});

		return NextResponse.json({
			ok: true,
			items: await listOperatorActionLogs(input),
		});
	} catch (error) {
		if (error instanceof OperatorActionError) {
			return NextResponse.json(
				{
					ok: false,
					error: error.message,
					code: error.code,
					details: error.details,
				},
				{ status: error.status }
			);
		}

		return NextResponse.json(
			{
				ok: false,
				error: error instanceof Error ? error.message : 'Server error',
			},
			{ status: 400 }
		);
	}
}
