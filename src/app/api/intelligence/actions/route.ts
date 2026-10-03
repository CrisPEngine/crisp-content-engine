import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
	dispatchIntelligenceAction,
	INTELLIGENCE_ACTION_NAMES,
} from '@/lib/intelligence/actions';
import {
	assertActionAllowed,
	enforceIntelligenceRateLimit,
	formatTelegramResult,
	logIntelligenceAction,
	replayIdempotent,
	resolveIntelligenceActor,
	storeIdempotent,
	type IntelligenceActor,
} from '@/lib/intelligence/actors';
import { jsonError } from '@/lib/intelligence/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
	action: z.enum(INTELLIGENCE_ACTION_NAMES),
	input: z.record(z.string(), z.unknown()).default({}),
});

function responseForActor(actor: IntelligenceActor, action: string, result: unknown, replayed: boolean) {
	if (actor.type === 'telegram') {
		return { ok: true, action, replayed, telegram: formatTelegramResult(action, result) };
	}
	return { ok: true, action, result, replayed };
}

export async function POST(request: Request) {
	const started = Date.now();
	let actor: IntelligenceActor | undefined;
	let actionName: string | undefined;
	let idempotencyKey: string | undefined;
	let brandAirtableId: string | undefined;
	try {
		actor = await resolveIntelligenceActor(request);
		const body = bodySchema.parse(await request.json().catch(() => ({})));
		actionName = body.action;
		brandAirtableId = typeof body.input.airtableBrandId === 'string' ? body.input.airtableBrandId : undefined;
		assertActionAllowed(actor, body.action);
		enforceIntelligenceRateLimit(actor, body.action);
		idempotencyKey =
			request.headers.get('idempotency-key') ||
			(typeof body.input.idempotencyKey === 'string' ? body.input.idempotencyKey : undefined);
		const replayed = replayIdempotent(actor, body.action, idempotencyKey ?? null, body.input);
		if (replayed) {
			return NextResponse.json(responseForActor(actor, body.action, replayed, true));
		}
		const result = await dispatchIntelligenceAction(actor.userId, body.action, body.input);
		storeIdempotent(actor, body.action, idempotencyKey ?? null, body.input, result);
		await logIntelligenceAction({
			userId: actor.userId,
			actor,
			action: body.action,
			ok: true,
			brandAirtableId,
			idempotencyKey,
			durationMs: Date.now() - started,
		});
		return NextResponse.json(responseForActor(actor, body.action, result, false));
	} catch (error) {
		if (actor && actionName) {
			await logIntelligenceAction({
				userId: actor.userId,
				actor,
				action: actionName,
				ok: false,
				errorCode: typeof error === 'object' && error && 'code' in error ? String((error as { code: string }).code) : undefined,
				brandAirtableId,
				idempotencyKey,
				durationMs: Date.now() - started,
			});
		}
		const mapped = jsonError(error);
		return NextResponse.json(mapped.body, { status: mapped.status });
	}
}
