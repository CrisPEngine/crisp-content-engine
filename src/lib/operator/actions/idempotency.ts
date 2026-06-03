import { createHash } from 'crypto';
import { getSupabaseService } from '@/lib/supabaseService';
import { OperatorActionError } from './errors';
import type { OperatorActor } from './logger';
import type { OperatorActionName, OperatorActionResponse } from './schemas';

const mutatingActions = new Set<OperatorActionName>([
	'create_or_update_brand_profile',
	'generate_or_refresh_brand_strategy',
	'generate_content_batch',
	'regenerate_individual_post',
	'update_content_status',
	'send_item_to_approval',
	'schedule_approved_content',
]);

export function isMutatingOperatorAction(action: OperatorActionName) {
	return mutatingActions.has(action);
}

export function createRequestHash(value: unknown) {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

type IdempotencyRecord = {
	status?: string;
	response?: OperatorActionResponse | null;
	request_hash?: string | null;
};

function normalizeRecord(value: unknown): IdempotencyRecord | null {
	if (!value || typeof value !== 'object') return null;
	return value as IdempotencyRecord;
}

export async function getSuccessfulIdempotentResponse(action: OperatorActionName, idempotencyKey?: string) {
	if (!idempotencyKey || !isMutatingOperatorAction(action)) return null;

	try {
		const admin = getSupabaseService();
		const { data, error } = await admin
			.from('operator_idempotency_keys')
			.select('status, response, request_hash')
			.eq('action', action)
			.eq('idempotency_key', idempotencyKey)
			.eq('status', 'succeeded')
			.maybeSingle();

		if (error) {
			console.warn('[OperatorAction] Idempotency lookup failed; continuing without replay:', error.message);
			return null;
		}

		const record = normalizeRecord(data);
		return record?.response ?? null;
	} catch (error) {
		console.warn('[OperatorAction] Idempotency lookup failed; continuing without replay:', error);
		return null;
	}
}

export async function reserveIdempotencyKey(options: {
	action: OperatorActionName;
	idempotencyKey?: string;
	requestHash: string;
	actor: OperatorActor;
	requestId: string;
	actionLogId: string;
}) {
	if (!options.idempotencyKey || !isMutatingOperatorAction(options.action)) return;

	try {
		const admin = getSupabaseService();
		const { error } = await admin
			.from('operator_idempotency_keys')
			.insert({
				action: options.action,
				idempotency_key: options.idempotencyKey,
				request_hash: options.requestHash,
				status: 'started',
				actor_type: options.actor.type,
				actor_id: options.actor.id,
				request_id: options.requestId,
				action_log_id: options.actionLogId,
			});

		if (!error) return;
		if (error.code !== '23505') {
			console.warn('[OperatorAction] Idempotency reservation failed; continuing without reservation:', error.message);
			return;
		}

		const { data } = await admin
			.from('operator_idempotency_keys')
			.select('status, response, request_hash')
			.eq('action', options.action)
			.eq('idempotency_key', options.idempotencyKey)
			.maybeSingle();
		const record = normalizeRecord(data);

		if (record?.status === 'succeeded' && record.response) {
			return record.response;
		}

		throw new OperatorActionError('Operator action with this idempotency key is already in progress', {
			status: 409,
			code: 'operator_idempotency_in_progress',
			details: {
				action: options.action,
				idempotencyKey: options.idempotencyKey,
				requestHashMatches: record?.request_hash === options.requestHash,
			},
		});
	} catch (error) {
		if (error instanceof OperatorActionError) throw error;
		console.warn('[OperatorAction] Idempotency reservation failed; continuing without reservation:', error);
	}
}

export async function completeIdempotencyKey(options: {
	action: OperatorActionName;
	idempotencyKey?: string;
	response: OperatorActionResponse;
}) {
	if (!options.idempotencyKey || !isMutatingOperatorAction(options.action)) return;

	try {
		const admin = getSupabaseService();
		const { error } = await admin
			.from('operator_idempotency_keys')
			.update({
				status: 'succeeded',
				response: options.response,
				updated_at: new Date().toISOString(),
			})
			.eq('action', options.action)
			.eq('idempotency_key', options.idempotencyKey);

		if (error) {
			console.warn('[OperatorAction] Idempotency completion failed:', error.message);
		}
	} catch (error) {
		console.warn('[OperatorAction] Idempotency completion failed:', error);
	}
}

export async function failIdempotencyKey(options: {
	action: OperatorActionName;
	idempotencyKey?: string;
	errorCode?: string;
	errorMessage: string;
}) {
	if (!options.idempotencyKey || !isMutatingOperatorAction(options.action)) return;

	try {
		const admin = getSupabaseService();
		const { error } = await admin
			.from('operator_idempotency_keys')
			.update({
				status: 'failed',
				error_code: options.errorCode,
				error_message: options.errorMessage,
				updated_at: new Date().toISOString(),
			})
			.eq('action', options.action)
			.eq('idempotency_key', options.idempotencyKey);

		if (error) {
			console.warn('[OperatorAction] Idempotency failure update failed:', error.message);
		}
	} catch (error) {
		console.warn('[OperatorAction] Idempotency failure update failed:', error);
	}
}
