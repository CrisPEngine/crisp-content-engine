import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOperatorAuth } from '@/lib/operator/auth';
import { assertOperatorConsoleEnabled } from '@/lib/operator/enabled';
import { OperatorActionError } from '@/lib/operator/actions/errors';
import { runOperatorAction } from '@/lib/operator/actions/service';
import { operatorActionRequestSchema } from '@/lib/operator/actions/schemas';
import { assertActorCanRunAction } from '@/lib/operator/actions/permissions';
import { enforceOperatorRateLimit } from '@/lib/operator/actions/rateLimit';

export const runtime = 'nodejs';

function requestIdFromHeaders(request: Request) {
	return request.headers.get('x-request-id') || `opreq_${crypto.randomUUID()}`;
}

function sourceIpFromHeaders(request: Request) {
	const forwardedFor = request.headers.get('x-forwarded-for');
	if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || null;
	return request.headers.get('x-real-ip');
}

export async function POST(request: Request) {
	try {
		assertOperatorConsoleEnabled();
		const actor = await requireOperatorAuth(request);
		const body = await request.json().catch(() => ({}));
		const bodyObject = body && typeof body === 'object' ? body as Record<string, unknown> : {};
		const idempotencyKey = typeof bodyObject.idempotencyKey === 'string'
			? bodyObject.idempotencyKey
			: request.headers.get('x-idempotency-key') || undefined;
		const actionRequest = operatorActionRequestSchema.parse({
			...bodyObject,
			idempotencyKey,
		});

		assertActorCanRunAction(actor, actionRequest.action);
		const sourceIp = sourceIpFromHeaders(request);
		await enforceOperatorRateLimit({
			action: actionRequest.action,
			actor,
			sourceIp,
		});

		const result = await runOperatorAction(actionRequest, actor, {
			requestId: requestIdFromHeaders(request),
			idempotencyKey,
			sourceIp,
			userAgent: request.headers.get('user-agent'),
		});

		return NextResponse.json(result);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return NextResponse.json(
				{
					ok: false,
					error: 'Invalid operator action payload',
					details: error.issues,
				},
				{ status: 400 }
			);
		}

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

		console.error('[Operator API] Unexpected error:', error);
		return NextResponse.json(
			{
				ok: false,
				error: 'Server error',
			},
			{ status: 500 }
		);
	}
}
