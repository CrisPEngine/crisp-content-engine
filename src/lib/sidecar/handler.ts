import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { assertSidecarApiEnabled } from './enabled';
import { requireSidecarAuth } from './auth';
import { sidecarCorsHeaders } from './cors';
import { SidecarError } from './errors';
import { redactValue } from './redaction';

export async function runSidecarRoute<T>(
	request: Request,
	handler: (actor: { userId: string }, request: Request) => Promise<T>,
): Promise<NextResponse> {
	try {
		assertSidecarApiEnabled();
		const actor = requireSidecarAuth(request);
		const result = await handler(actor, request);
		return NextResponse.json({ ok: true, ...result }, { headers: sidecarCorsHeaders(request) });
	} catch (error) {
		if (error instanceof ZodError) {
			return NextResponse.json(
				{ ok: false, error: 'Invalid request', code: 'sidecar_validation_error', details: error.issues },
				{ status: 400, headers: sidecarCorsHeaders(request) },
			);
		}
		if (error instanceof SidecarError) {
			return NextResponse.json(
				{ ok: false, error: error.message, code: error.code, details: error.details },
				{ status: error.status, headers: sidecarCorsHeaders(request) },
			);
		}
		console.error('[Sidecar]', redactValue({ message: error instanceof Error ? error.message : 'Unknown' }));
		return NextResponse.json(
			{ ok: false, error: 'Internal server error', code: 'sidecar_internal_error' },
			{ status: 500, headers: sidecarCorsHeaders(request) },
		);
	}
}
