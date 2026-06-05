import 'server-only';

import { createHash } from 'crypto';
import { getSupabaseService } from '@/lib/supabaseService';

export function extractIdempotencyKey(request: Request, body: unknown): string | undefined {
	const header =
		request.headers.get('Idempotency-Key') ?? request.headers.get('idempotency-key');
	if (header?.trim()) return header.trim().slice(0, 128);

	if (body && typeof body === 'object' && 'idempotency_key' in body) {
		const key = (body as { idempotency_key?: unknown }).idempotency_key;
		if (typeof key === 'string' && key.trim()) return key.trim().slice(0, 128);
	}

	return undefined;
}

export function createRunRequestFingerprint(payload: {
	userId: string;
	brandProfileId: string;
	idea: string;
	selectedChannels: string[];
	publishMode: string;
}): string {
	return createHash('sha256')
		.update(
			JSON.stringify({
				userId: payload.userId,
				brandProfileId: payload.brandProfileId,
				idea: payload.idea,
				selectedChannels: [...payload.selectedChannels].sort(),
				publishMode: payload.publishMode,
			}),
		)
		.digest('hex');
}

type ExistingRun = {
	id: string;
	series_run_id: string;
	status: string;
};

export async function findExistingRunByIdempotencyKey(
	userId: string,
	idempotencyKey: string,
): Promise<ExistingRun | null> {
	const admin = getSupabaseService();
	const { data } = await admin
		.from('idea_engine_runs')
		.select('id, series_run_id, status')
		.eq('user_id', userId)
		.eq('idempotency_key', idempotencyKey)
		.not('status', 'in', '("cancelled","failed")')
		.maybeSingle();

	return data ?? null;
}
