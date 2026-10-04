import { createHash } from 'crypto';
import { resolveAgentCredential } from './credentials';
import { getAgentStore } from './controlStore';
import { AgentError, agentErrorFromUnknown } from './errors';
import { dispatchAgentHandler, type AgentContext } from './handlers';
import type { RateLimitPolicy } from './policy';
import { getAgentAction } from './registry';
import type { AgentCredential } from './types';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export type AgentResponseBody = {
	ok: boolean;
	action: string;
	requestId: string;
	result?: unknown;
	error?: { code: string; message: string; retryable: boolean; details?: Record<string, unknown> };
};

const SECRET = /token|secret|authorization|password|cookie|keyhash|apikey/i;

function stable(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stable);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([key]) => key !== 'idempotencyKey')
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, item]) => [key, stable(item)]),
		);
	}
	return value;
}

function summarise(value: unknown, depth = 0): unknown {
	if (depth > 4) return undefined;
	if (typeof value === 'string') return value.length > 400 ? `${value.slice(0, 400)}…` : value;
	if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
	if (Array.isArray(value)) return value.slice(0, 20).map((item) => summarise(item, depth + 1));
	if (typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) {
			if (SECRET.test(key)) continue;
			out[key] = summarise(item, depth + 1);
		}
		return out;
	}
	return undefined;
}

function requestHash(action: string, payload: unknown): string {
	return createHash('sha256').update(JSON.stringify({ action, payload: stable(payload) })).digest('hex');
}

function rateSpec(action: string, policy: RateLimitPolicy): { key: string; limit: number; windowMs: number } | null {
	if (['cce_generate_content', 'cce_generate_from_opportunity', 'cce_request_revision'].includes(action)) {
		return { key: 'generation', limit: policy.generationsPerDay, windowMs: DAY };
	}
	if (['cce_create_opportunity', 'cce_create_research_request'].includes(action)) {
		return { key: 'research', limit: policy.researchRequestsPerDay, windowMs: DAY };
	}
	if (['cce_schedule_content', 'cce_reschedule_content', 'cce_unschedule_content', 'cce_record_external_publish'].includes(action)) {
		return { key: 'publish', limit: policy.publishActionsPerDay, windowMs: DAY };
	}
	if (['cce_propose_ad_campaign', 'cce_propose_budget_change'].includes(action)) {
		return { key: 'ads', limit: policy.adProposalsPerDay, windowMs: DAY };
	}
	return null;
}

async function enforceRequestRate(credential: AgentCredential): Promise<void> {
	const request = await getAgentStore().consumeRate(credential.id, 'requests', credential.rateLimit.requestsPerHour, HOUR);
	if (!request.allowed) throw new AgentError('rate_limit', 'Hourly request limit reached.', 429, undefined, true);
}

async function enforceActionRate(credential: AgentCredential, action: string): Promise<void> {
	const extra = rateSpec(action, credential.rateLimit);
	if (!extra) return;
	const consumed = await getAgentStore().consumeRate(credential.id, extra.key, extra.limit, extra.windowMs);
	if (!consumed.allowed) throw new AgentError('rate_limit', 'Action rate limit reached.', 429, { bucket: extra.key }, true);
}

function affectedObject(result: unknown): string | undefined {
	if (!result || typeof result !== 'object') return undefined;
	const row = result as Record<string, unknown>;
	for (const key of ['contentId', 'briefId', 'opportunityId', 'approvalId', 'id']) {
		if (typeof row[key] === 'string') return row[key];
	}
	return undefined;
}

export async function executeAgentAction(input: {
	credential: AgentCredential;
	action: string;
	payload: unknown;
	idempotencyKey?: string | null;
	requestId?: string;
}): Promise<{ status: number; body: AgentResponseBody }> {
	const started = Date.now();
	const requestId = input.requestId || crypto.randomUUID();
	const definition = getAgentAction(input.action);
	const payload = input.payload && typeof input.payload === 'object' ? (input.payload as Record<string, unknown>) : {};
	const brandId = typeof payload.brandId === 'string' ? payload.brandId : input.credential.allowedBrandIds.length === 1 ? input.credential.allowedBrandIds[0] : undefined;
	let status = 500;
	let body: AgentResponseBody = { ok: false, action: input.action, requestId };
	let approvalId: string | undefined;
	try {
		if (!definition) throw new AgentError('unknown_action', `Unknown agent action ${input.action}.`, 404);
		if (!input.credential.capabilities.includes(definition.capability)) {
			throw new AgentError('capability_not_enabled', `This agent cannot ${input.action}.`, 403, { capability: definition.capability, consequence: definition.level });
		}
		await enforceRequestRate(input.credential);
		const parsed = definition.schema.safeParse(payload);
		if (!parsed.success) {
			throw new AgentError('invalid_input', parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
		}
		const idempotencyKey = input.idempotencyKey?.trim() || null;
		if (definition.level > 0 && !idempotencyKey) {
			throw new AgentError('idempotency_key_required', 'Mutating agent actions require an idempotency key.', 400);
		}
		if (idempotencyKey) {
			const existing = await getAgentStore().readIdempotency(input.credential.id, idempotencyKey);
			const hash = requestHash(input.action, parsed.data);
			if (existing) {
				if (existing.requestHash !== hash) {
					throw new AgentError('idempotency_conflict', 'Idempotency key was reused with a different request.', 409);
				}
				const stored = existing.response as { status: number; body: AgentResponseBody };
				await audit(input, definition.capability, definition.level, requestId, brandId, stored.status, stored.body, started, undefined, undefined);
				return stored;
			}
		}
		await enforceActionRate(input.credential, input.action);
		const ctx: AgentContext = { credential: input.credential, requestId };
		const result = await dispatchAgentHandler(input.action, ctx, parsed.data as Record<string, unknown>);
		if (definition.level >= 4) {
			const approval = result && typeof result === 'object' ? (result as { status?: string }).status : undefined;
			if (approval !== 'approval_required') {
				throw new AgentError('approval_required', 'Financial actions cannot be executed by an agent credential.', 403, { consequence: 4 });
			}
		}
		approvalId = result && typeof result === 'object' ? ((result as { approvalId?: string }).approvalId) : undefined;
		status = 200;
		body = { ok: true, action: input.action, requestId, result };
		if (idempotencyKey) {
			await getAgentStore().writeIdempotency({
				credentialId: input.credential.id,
				idempotencyKey,
				requestHash: requestHash(input.action, parsed.data),
				response: { status, body },
				createdAt: new Date().toISOString(),
			});
		}
		await audit(input, definition.capability, definition.level, requestId, brandId, status, body, started, affectedObject(result), approvalId);
		return { status, body };
	} catch (error) {
		const agentError = agentErrorFromUnknown(error);
		status = agentError.status;
		body = {
			ok: false,
			action: input.action,
			requestId,
			error: { code: agentError.code, message: agentError.message, retryable: agentError.retryable, details: agentError.details },
		};
		await audit(input, definition?.capability, definition?.level, requestId, brandId, status, body, started, undefined, undefined, agentError.code);
		return { status, body };
	}
}

async function audit(
	input: { credential: AgentCredential; action: string; payload: unknown; idempotencyKey?: string | null },
	capability: string | undefined,
	level: number | undefined,
	requestId: string,
	brandId: string | undefined,
	status: number,
	body: AgentResponseBody,
	started: number,
	affected: string | undefined,
	approvalId: string | undefined,
	errorCode?: string,
): Promise<void> {
	try {
		await getAgentStore().writeAudit({
			id: crypto.randomUUID(),
			credentialId: input.credential.id,
			ownerUserId: input.credential.ownerUserId,
			brandId,
			action: input.action,
			capability,
			consequenceLevel: level,
			requestId,
			idempotencyKey: input.idempotencyKey ?? undefined,
			requestSummary: (summarise(input.payload) as Record<string, unknown>) ?? {},
			affectedObject: affected,
			resultStatus: body.ok ? 'ok' : 'error',
			approvalRequired: body.ok ? (body.result as { status?: string } | undefined)?.status === 'approval_required' : errorCode === 'approval_required',
			approvalId,
			latencyMs: Date.now() - started,
			errorCode,
			createdAt: new Date().toISOString(),
		});
	} catch {
		// A failed audit write must not hide the action result. The error is already in the response.
	}
}

export async function executeFromAuthorization(input: {
	authorization: string | null;
	action: string;
	payload: unknown;
	idempotencyKey?: string | null;
	requestId?: string;
}): Promise<{ status: number; body: AgentResponseBody }> {
	try {
		const credential = await resolveAgentCredential(input.authorization);
		return executeAgentAction({ ...input, credential });
	} catch (error) {
		const agentError = agentErrorFromUnknown(error);
		return {
			status: agentError.status,
			body: {
				ok: false,
				action: input.action,
				requestId: input.requestId || crypto.randomUUID(),
				error: { code: agentError.code, message: agentError.message, retryable: agentError.retryable },
			},
		};
	}
}
