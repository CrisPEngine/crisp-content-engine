import { createHash } from 'crypto';

const IDEMPOTENCY_PAYLOAD_KEYS = new Set(['idempotencyKey', 'idempotency_key']);

export function stablePayload(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stablePayload);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([key]) => !IDEMPOTENCY_PAYLOAD_KEYS.has(key))
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, item]) => [key, stablePayload(item)]),
		);
	}
	return value;
}

export function agentRequestHash(action: string, payload: unknown): string {
	return createHash('sha256').update(JSON.stringify({ action, payload: stablePayload(payload) })).digest('hex');
}

export function synthesizeIdempotencyKey(credentialId: string, action: string, payload: unknown): string {
	const digest = createHash('sha256').update(`${credentialId}:${agentRequestHash(action, payload)}`).digest('hex');
	return `auto:${digest}`;
}

type HeaderLike = { get(name: string): string | null };

function trimmedString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/** Prefer an explicit client key from args, body, or Idempotency-Key headers. */
export function pickExplicitIdempotencyKey(sources: {
	direct?: string | null;
	payload?: Record<string, unknown>;
	headers?: HeaderLike | null;
}): string | undefined {
	const fromHeaders =
		trimmedString(sources.headers?.get('Idempotency-Key')) ?? trimmedString(sources.headers?.get('idempotency-key'));
	return (
		trimmedString(sources.direct) ??
		trimmedString(sources.payload?.idempotencyKey) ??
		trimmedString(sources.payload?.idempotency_key) ??
		fromHeaders
	);
}

export function resolveMutatingIdempotencyKey(input: {
	credentialId: string;
	action: string;
	parsedPayload: unknown;
	level: number;
	direct?: string | null;
	rawPayload?: Record<string, unknown>;
	headers?: HeaderLike | null;
}): string | null {
	if (input.level <= 0) return null;
	const explicit = pickExplicitIdempotencyKey({
		direct: input.direct,
		payload: input.rawPayload,
		headers: input.headers,
	});
	if (explicit) return explicit;
	return synthesizeIdempotencyKey(input.credentialId, input.action, input.parsedPayload);
}
