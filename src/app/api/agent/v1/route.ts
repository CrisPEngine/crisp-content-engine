import { NextResponse } from 'next/server';
import { executeFromAuthorization } from '@/lib/agent/execute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Matches MCP: headroom for long-form content generation when not using async article jobs. */
export const maxDuration = 300;

export async function POST(request: Request) {
	let body: { action?: string; input?: unknown; idempotencyKey?: string; idempotency_key?: string };
	try {
		body = (await request.json()) as { action?: string; input?: unknown; idempotencyKey?: string; idempotency_key?: string };
	} catch {
		return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'JSON body required.', retryable: false } }, { status: 400 });
	}
	if (!body.action) {
		return NextResponse.json({ ok: false, error: { code: 'invalid_input', message: 'action is required.', retryable: false } }, { status: 400 });
	}
	const result = await executeFromAuthorization({
		authorization: request.headers.get('authorization'),
		action: body.action,
		payload: body.input ?? {},
		idempotencyKey: body.idempotencyKey ?? body.idempotency_key ?? undefined,
		requestId: request.headers.get('x-request-id') ?? undefined,
		headers: request.headers,
	});
	return NextResponse.json(result.body, { status: result.status });
}

export async function GET(request: Request) {
	const result = await executeFromAuthorization({
		authorization: request.headers.get('authorization'),
		action: 'cce_get_capabilities',
		payload: {},
		requestId: request.headers.get('x-request-id') ?? undefined,
	});
	return NextResponse.json(result.body, { status: result.status });
}
