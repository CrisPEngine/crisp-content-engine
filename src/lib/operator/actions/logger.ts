import { getSupabaseService } from '@/lib/supabaseService';
import type { OperatorScope } from './permissions';
import type { OperatorActionName } from './schemas';

export type OperatorActor = {
	type: 'admin_session' | 'operator_secret' | 'system';
	id: string;
	email?: string | null;
	scopes: OperatorScope[];
};

export type OperatorLogStatus = 'started' | 'succeeded' | 'failed';

export type OperatorActionLogEntry = {
	id: string;
	created_at: string;
	action: OperatorActionName;
	status: OperatorLogStatus;
	request_id: string;
	idempotency_key?: string | null;
	actor: OperatorActor;
	dryRun: boolean;
	brand_profile_id?: string | null;
	content_id?: string | null;
	input_summary?: Record<string, unknown>;
	output_summary?: Record<string, unknown>;
	result?: unknown;
	duration_ms?: number | null;
	source_ip?: string | null;
	user_agent?: string | null;
	message?: string;
	metadata?: Record<string, unknown>;
	error?: {
		code?: string;
		message: string;
		details?: unknown;
	};
};

const MAX_LOGS = 500;
const logs: OperatorActionLogEntry[] = [];

export type OperatorRequestContext = {
	requestId: string;
	idempotencyKey?: string;
	sourceIp?: string | null;
	userAgent?: string | null;
};

type StartLogInput = {
	action: OperatorActionName;
	actor: OperatorActor;
	dryRun: boolean;
	request: OperatorRequestContext;
	brandProfileId?: string;
	contentId?: string;
	inputSummary?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
};

type CompleteLogInput = {
	id: string;
	outputSummary?: Record<string, unknown>;
	result?: unknown;
	durationMs: number;
	metadata?: Record<string, unknown>;
};

type FailLogInput = {
	id: string;
	error: {
		code?: string;
		message: string;
		details?: unknown;
	};
	durationMs: number;
	metadata?: Record<string, unknown>;
};

function createLogId() {
	return crypto.randomUUID();
}

function persistLog(entry: OperatorActionLogEntry) {
	const existingIndex = logs.findIndex((item) => item.id === entry.id);
	if (existingIndex >= 0) {
		logs.splice(existingIndex, 1);
	}
	logs.unshift(entry);
	if (logs.length > MAX_LOGS) {
		logs.length = MAX_LOGS;
	}

	const level = entry.status === 'failed' ? 'error' : 'info';
	console[level]('[OperatorAction]', JSON.stringify(entry));
}

function getFallbackLog(id: string) {
	return logs.find((entry) => entry.id === id);
}

function mapRowToLogEntry(row: Record<string, unknown>): OperatorActionLogEntry {
	return {
		id: String(row.id),
		created_at: String(row.created_at),
		action: row.action as OperatorActionName,
		status: row.status as OperatorLogStatus,
		request_id: String(row.request_id),
		idempotency_key: row.idempotency_key ? String(row.idempotency_key) : null,
		actor: {
			type: row.actor_type as OperatorActor['type'],
			id: String(row.actor_id || 'unknown'),
			scopes: [],
		},
		dryRun: Boolean(row.dry_run),
		brand_profile_id: row.brand_profile_id ? String(row.brand_profile_id) : null,
		content_id: row.content_id ? String(row.content_id) : null,
		input_summary: row.input_summary as Record<string, unknown> | undefined,
		output_summary: row.output_summary as Record<string, unknown> | undefined,
		result: row.result,
		duration_ms: typeof row.duration_ms === 'number' ? row.duration_ms : null,
		source_ip: row.source_ip ? String(row.source_ip) : null,
		user_agent: row.user_agent ? String(row.user_agent) : null,
		metadata: row.metadata as Record<string, unknown> | undefined,
		error: row.error_message
			? {
				code: row.error_code ? String(row.error_code) : undefined,
				message: String(row.error_message),
			}
			: undefined,
	};
}

export async function startOperatorActionLog(input: StartLogInput) {
	const fullEntry: OperatorActionLogEntry = {
		id: createLogId(),
		created_at: new Date().toISOString(),
		action: input.action,
		status: 'started',
		request_id: input.request.requestId,
		idempotency_key: input.request.idempotencyKey || null,
		actor: input.actor,
		dryRun: input.dryRun,
		brand_profile_id: input.brandProfileId || null,
		content_id: input.contentId || null,
		input_summary: input.inputSummary,
		source_ip: input.request.sourceIp || null,
		user_agent: input.request.userAgent || null,
		metadata: input.metadata,
	};
	persistLog(fullEntry);

	try {
		const admin = getSupabaseService();
		const { data, error } = await admin
			.from('operator_action_logs')
			.insert({
				id: fullEntry.id,
				action: fullEntry.action,
				status: fullEntry.status,
				request_id: fullEntry.request_id,
				idempotency_key: fullEntry.idempotency_key,
				actor_type: fullEntry.actor.type,
				actor_id: fullEntry.actor.id,
				dry_run: fullEntry.dryRun,
				brand_profile_id: fullEntry.brand_profile_id,
				content_id: fullEntry.content_id,
				input_summary: fullEntry.input_summary ?? {},
				source_ip: fullEntry.source_ip,
				user_agent: fullEntry.user_agent,
				metadata: fullEntry.metadata ?? {},
			})
			.select('id, created_at')
			.single();

		if (!error && data && typeof data === 'object') {
			const row = data as Record<string, unknown>;
			fullEntry.id = String(row.id);
			fullEntry.created_at = String(row.created_at);
		} else if (error) {
			console.warn('[OperatorAction] Durable log insert failed; using console fallback:', error.message);
		}
	} catch (error) {
		console.warn('[OperatorAction] Durable log insert failed; using console fallback:', error);
	}

	return fullEntry;
}

export async function completeOperatorActionLog(input: CompleteLogInput) {
	const fallback = getFallbackLog(input.id);
	if (fallback) {
		fallback.status = 'succeeded';
		fallback.output_summary = input.outputSummary;
		fallback.result = input.result;
		fallback.duration_ms = input.durationMs;
		fallback.metadata = { ...(fallback.metadata || {}), ...(input.metadata || {}) };
		persistLog(fallback);
	}

	try {
		const admin = getSupabaseService();
		const { error } = await admin
			.from('operator_action_logs')
			.update({
				status: 'succeeded',
				output_summary: input.outputSummary ?? {},
				result: input.result ?? null,
				duration_ms: input.durationMs,
				completed_at: new Date().toISOString(),
				metadata: {
					...(fallback?.metadata || {}),
					...(input.metadata || {}),
				},
			})
			.eq('id', input.id);

		if (error) {
			console.warn('[OperatorAction] Durable log update failed; using console fallback:', error.message);
		}
	} catch (error) {
		console.warn('[OperatorAction] Durable log update failed; using console fallback:', error);
	}
}

export async function failOperatorActionLog(input: FailLogInput) {
	const fallback = getFallbackLog(input.id);
	if (fallback) {
		fallback.status = 'failed';
		fallback.error = input.error;
		fallback.duration_ms = input.durationMs;
		fallback.metadata = { ...(fallback.metadata || {}), ...(input.metadata || {}) };
		persistLog(fallback);
	}

	try {
		const admin = getSupabaseService();
		const { error } = await admin
			.from('operator_action_logs')
			.update({
				status: 'failed',
				error_code: input.error.code,
				error_message: input.error.message,
				duration_ms: input.durationMs,
				completed_at: new Date().toISOString(),
				metadata: {
					...(fallback?.metadata || {}),
					...(input.metadata || {}),
					error_details: input.error.details,
				},
			})
			.eq('id', input.id);

		if (error) {
			console.warn('[OperatorAction] Durable log failure update failed; using console fallback:', error.message);
		}
	} catch (error) {
		console.warn('[OperatorAction] Durable log failure update failed; using console fallback:', error);
	}
}

export async function listOperatorActionLogs(filters: {
	action?: OperatorActionName;
	status?: OperatorLogStatus;
	limit?: number;
} = {}) {
	const limit = filters.limit ?? 50;

	try {
		const admin = getSupabaseService();
		let query = admin
			.from('operator_action_logs')
			.select('*')
			.order('created_at', { ascending: false })
			.limit(limit);

		if (filters.action) query = query.eq('action', filters.action);
		if (filters.status) query = query.eq('status', filters.status);

		const { data, error } = await query;
		if (!error && Array.isArray(data)) {
			return (data as Record<string, unknown>[]).map(mapRowToLogEntry);
		}
		if (error) {
			console.warn('[OperatorAction] Durable log read failed; using console fallback:', error.message);
		}
	} catch (error) {
		console.warn('[OperatorAction] Durable log read failed; using console fallback:', error);
	}

	return logs
		.filter((entry) => !filters.action || entry.action === filters.action)
		.filter((entry) => !filters.status || entry.status === filters.status)
		.slice(0, limit);
}
