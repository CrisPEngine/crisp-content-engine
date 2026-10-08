import { getSupabaseService } from '@/lib/supabaseService';
import type { AgentCapability, RateLimitPolicy } from './policy';
import type {
	AdChangeProposal,
	AgentBriefRecord,
	AgentControlStore,
	AgentCredential,
	AgentEvent,
	ApprovalRequest,
	AuditEntry,
	CommunityInteraction,
	ContentAsset,
	IdempotencyRecord,
	MarketingOpportunity,
	ResearchRecord,
	ResearchMonitor,
} from './types';

type RecordKind = 'opportunity' | 'brief' | 'research' | 'research_monitor' | 'interaction' | 'ad_proposal' | 'event' | 'feedback' | 'asset' | 'mcp_oauth';

function db() {
	return getSupabaseService();
}

function credentialFromRow(row: Record<string, unknown>): AgentCredential {
	return {
		id: String(row.id),
		name: String(row.name),
		ownerUserId: String(row.owner_user_id),
		organisationId: (row.organisation_id as string | null) ?? undefined,
		scope: row.scope === 'SELECTED_BRANDS' || row.scope === 'OWNER_ACCOUNT' ? row.scope : 'BRAND',
		allowedBrandIds: (row.allowed_brand_ids as string[]) ?? [],
		capabilities: (row.capabilities as AgentCapability[]) ?? [],
		environment: row.environment as AgentCredential['environment'],
		keyHash: String(row.key_hash),
		keyPrefix: String(row.key_prefix),
		rateLimit: row.rate_limit as RateLimitPolicy,
		createdAt: String(row.created_at),
		lastUsedAt: (row.last_used_at as string | null) ?? undefined,
		expiresAt: (row.expires_at as string | null) ?? undefined,
		revokedAt: (row.revoked_at as string | null) ?? undefined,
	};
}

async function saveRecord<T extends { id: string; brandId?: string }>(ownerUserId: string, kind: RecordKind, value: T): Promise<T> {
	const { error } = await db().from('agent_records').upsert({
		id: value.id,
		owner_user_id: ownerUserId,
		brand_id: value.brandId ?? null,
		kind,
		payload: value,
	});
	if (error) throw new Error(error.message);
	return value;
}

async function loadRecord<T>(ownerUserId: string, kind: RecordKind, id: string): Promise<T | null> {
	const { data, error } = await db()
		.from('agent_records')
		.select('payload')
		.eq('owner_user_id', ownerUserId)
		.eq('kind', kind)
		.eq('id', id)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return (data?.payload as T | undefined) ?? null;
}

async function listRecords<T extends { brandId?: string }>(ownerUserId: string, kind: RecordKind, brandId?: string): Promise<T[]> {
	let query = db().from('agent_records').select('payload').eq('owner_user_id', ownerUserId).eq('kind', kind);
	if (brandId) query = query.eq('brand_id', brandId);
	const { data, error } = await query;
	if (error) throw new Error(error.message);
	return (data ?? []).map((row) => row.payload as T);
}

function approvalToRow(request: ApprovalRequest) {
	return {
		id: request.id,
		owner_user_id: request.ownerUserId,
		brand_id: request.brandId,
		credential_id: request.credentialId,
		action: request.action,
		target_type: request.targetType,
		target_id: request.targetId,
		summary: request.summary,
		preview: request.preview,
		consequence_level: request.consequenceLevel,
		requested_action: request.requestedAction,
		parameters: request.parameters,
		parameter_hash: request.parameterHash,
		content_hash: request.contentHash,
		status: request.status,
		token_hash: request.tokenHash,
		created_at: request.createdAt,
		expires_at: request.expiresAt,
		resolved_at: request.resolvedAt ?? null,
		resolved_by: request.resolvedBy ?? null,
		authorization_method: request.authorizationMethod ?? null,
		execution_status: request.executionStatus,
		idempotency_key: request.idempotencyKey ?? null,
	};
}

function approvalFromRow(row: Record<string, unknown>): ApprovalRequest {
	return {
		id: String(row.id),
		ownerUserId: String(row.owner_user_id),
		brandId: String(row.brand_id),
		credentialId: String(row.credential_id),
		action: String(row.action),
		targetType:
			row.target_type === 'article' ? 'article' : row.target_type === 'reply' ? 'reply' : 'content',
		targetId: String(row.target_id),
		summary: String(row.summary),
		preview: (row.preview as Record<string, unknown>) ?? {},
		consequenceLevel: Number(row.consequence_level),
		requestedAction:
			row.requested_action === 'approve_and_schedule'
				? 'approve_and_schedule'
				: row.requested_action === 'approve_and_post_reply'
					? 'approve_and_post_reply'
					: 'approve_content',
		parameters: (row.parameters as Record<string, unknown>) ?? {},
		parameterHash: String(row.parameter_hash),
		contentHash: String(row.content_hash),
		status: row.status as ApprovalRequest['status'],
		tokenHash: String(row.token_hash),
		createdAt: String(row.created_at),
		expiresAt: String(row.expires_at),
		resolvedAt: (row.resolved_at as string | null) ?? undefined,
		resolvedBy: (row.resolved_by as string | null) ?? undefined,
		authorizationMethod: (row.authorization_method as string | null) ?? undefined,
		executionStatus: row.execution_status as ApprovalRequest['executionStatus'],
		idempotencyKey: (row.idempotency_key as string | null) ?? undefined,
	};
}

export function createSupabaseAgentStore(): AgentControlStore {
	return {
		async saveApprovalRequest(request) {
			const { error } = await db().from('approval_requests').upsert(approvalToRow(request));
			if (error) throw new Error(error.message);
			return request;
		},
		async getApprovalRequest(id) {
			const { data, error } = await db().from('approval_requests').select('*').eq('id', id).maybeSingle();
			if (error) throw new Error(error.message);
			return data ? approvalFromRow(data as Record<string, unknown>) : null;
		},
		async getApprovalRequestByTokenHash(tokenHash) {
			const { data, error } = await db().from('approval_requests').select('*').eq('token_hash', tokenHash).maybeSingle();
			if (error) throw new Error(error.message);
			return data ? approvalFromRow(data as Record<string, unknown>) : null;
		},
		async listApprovalRequests(ownerUserId, status) {
			let query = db().from('approval_requests').select('*').eq('owner_user_id', ownerUserId);
			if (status) query = query.eq('status', status);
			const { data, error } = await query;
			if (error) throw new Error(error.message);
			return (data ?? []).map((row) => approvalFromRow(row as Record<string, unknown>));
		},
		async insertCredential(credential) {
			const { error } = await db().from('agent_credentials').insert({
				id: credential.id,
				name: credential.name,
				owner_user_id: credential.ownerUserId,
				organisation_id: credential.organisationId ?? null,
				scope: credential.scope ?? 'BRAND',
				allowed_brand_ids: credential.allowedBrandIds,
				capabilities: credential.capabilities,
				environment: credential.environment,
				key_hash: credential.keyHash,
				key_prefix: credential.keyPrefix,
				rate_limit: credential.rateLimit,
				created_at: credential.createdAt,
				expires_at: credential.expiresAt ?? null,
			});
			if (error) throw new Error(error.message);
		},
		async updateCredential(id, patch) {
			const row: Record<string, unknown> = {};
			if (patch.lastUsedAt) row.last_used_at = patch.lastUsedAt;
			if (patch.revokedAt) row.revoked_at = patch.revokedAt;
			if (patch.capabilities) row.capabilities = patch.capabilities;
			if (patch.allowedBrandIds) row.allowed_brand_ids = patch.allowedBrandIds;
			if (Object.keys(row).length === 0) return;
			const { error } = await db().from('agent_credentials').update(row).eq('id', id);
			if (error) throw new Error(error.message);
		},
		async findCredentialByHash(keyHash) {
			const { data, error } = await db().from('agent_credentials').select('*').eq('key_hash', keyHash).maybeSingle();
			if (error) throw new Error(error.message);
			return data ? credentialFromRow(data as Record<string, unknown>) : null;
		},
		async listCredentials(ownerUserId) {
			const { data, error } = await db().from('agent_credentials').select('*').eq('owner_user_id', ownerUserId);
			if (error) throw new Error(error.message);
			return (data ?? []).map((row) => credentialFromRow(row as Record<string, unknown>));
		},
		async getCredential(ownerUserId, id) {
			const { data, error } = await db()
				.from('agent_credentials')
				.select('*')
				.eq('owner_user_id', ownerUserId)
				.eq('id', id)
				.maybeSingle();
			if (error) throw new Error(error.message);
			return data ? credentialFromRow(data as Record<string, unknown>) : null;
		},
		async readIdempotency(credentialId, key) {
			const { data, error } = await db()
				.from('agent_idempotency')
				.select('*')
				.eq('credential_id', credentialId)
				.eq('idempotency_key', key)
				.maybeSingle();
			if (error) throw new Error(error.message);
			if (!data) return null;
			return {
				credentialId,
				idempotencyKey: key,
				requestHash: String(data.request_hash),
				response: data.response,
				createdAt: String(data.created_at),
			} satisfies IdempotencyRecord;
		},
		async writeIdempotency(record) {
			const { error } = await db().from('agent_idempotency').insert({
				credential_id: record.credentialId,
				idempotency_key: record.idempotencyKey,
				request_hash: record.requestHash,
				response: record.response,
				created_at: record.createdAt,
			});
			if (error) throw new Error(error.message);
		},
		async consumeRate(credentialId, windowKey, limit, windowMs) {
			const now = Date.now();
			const { data, error } = await db()
				.from('agent_rate_windows')
				.select('count,reset_at')
				.eq('credential_id', credentialId)
				.eq('window_key', windowKey)
				.maybeSingle();
			if (error) throw new Error(error.message);
			const resetAt = data?.reset_at ? Date.parse(String(data.reset_at)) : 0;
			const fresh = !data || resetAt <= now;
			const count = fresh ? 1 : Number(data.count) + 1;
			const nextReset = fresh ? new Date(now + windowMs).toISOString() : String(data.reset_at);
			const { error: upsertError } = await db().from('agent_rate_windows').upsert({
				credential_id: credentialId,
				window_key: windowKey,
				count,
				reset_at: nextReset,
			});
			if (upsertError) throw new Error(upsertError.message);
			return { allowed: count <= limit, count };
		},
		async addCost(credentialId, usd) {
			const day = new Date().toISOString().slice(0, 10);
			const current = await this.costToday(credentialId);
			const imageUsd = await this.imageCostToday(credentialId);
			const { error } = await db().from('agent_daily_cost').upsert({
				credential_id: credentialId,
				day,
				usd: current + usd,
				image_usd: imageUsd,
			});
			if (error) throw new Error(error.message);
			return current + usd;
		},
		async costToday(credentialId) {
			const day = new Date().toISOString().slice(0, 10);
			const { data, error } = await db()
				.from('agent_daily_cost')
				.select('usd')
				.eq('credential_id', credentialId)
				.eq('day', day)
				.maybeSingle();
			if (error) throw new Error(error.message);
			return data ? Number(data.usd) : 0;
		},
		async addImageCost(credentialId, usd) {
			const day = new Date().toISOString().slice(0, 10);
			const current = await this.costToday(credentialId);
			const imageUsd = await this.imageCostToday(credentialId);
			const { error } = await db().from('agent_daily_cost').upsert({
				credential_id: credentialId,
				day,
				usd: current + usd,
				image_usd: imageUsd + usd,
			});
			if (error) throw new Error(error.message);
			return imageUsd + usd;
		},
		async imageCostToday(credentialId) {
			const day = new Date().toISOString().slice(0, 10);
			const { data, error } = await db()
				.from('agent_daily_cost')
				.select('image_usd')
				.eq('credential_id', credentialId)
				.eq('day', day)
				.maybeSingle();
			if (error) throw new Error(error.message);
			return data ? Number(data.image_usd) : 0;
		},
		async writeAudit(entry) {
			const { error } = await db().from('agent_audit_log').insert({
				id: entry.id,
				credential_id: entry.credentialId,
				owner_user_id: entry.ownerUserId,
				brand_id: entry.brandId ?? null,
				action: entry.action,
				capability: entry.capability ?? null,
				consequence_level: entry.consequenceLevel ?? null,
				request_id: entry.requestId,
				idempotency_key: entry.idempotencyKey ?? null,
				request_summary: entry.requestSummary,
				affected_object: entry.affectedObject ?? null,
				result_status: entry.resultStatus,
				approval_required: entry.approvalRequired,
				approval_id: entry.approvalId ?? null,
				latency_ms: entry.latencyMs,
				error_code: entry.errorCode ?? null,
				external_ids: entry.externalIds ?? {},
				created_at: entry.createdAt,
			});
			if (error) throw new Error(error.message);
		},
		async listAudit(ownerUserId, credentialId) {
			let query = db().from('agent_audit_log').select('*').eq('owner_user_id', ownerUserId).order('created_at', { ascending: false }).limit(100);
			if (credentialId) query = query.eq('credential_id', credentialId);
			const { data, error } = await query;
			if (error) throw new Error(error.message);
			return (data ?? []).map((row) => ({
				id: String(row.id),
				credentialId: String(row.credential_id),
				ownerUserId: String(row.owner_user_id),
				brandId: (row.brand_id as string | null) ?? undefined,
				action: String(row.action),
				capability: (row.capability as string | null) ?? undefined,
				consequenceLevel: (row.consequence_level as number | null) ?? undefined,
				requestId: String(row.request_id),
				idempotencyKey: (row.idempotency_key as string | null) ?? undefined,
				requestSummary: (row.request_summary as Record<string, unknown>) ?? {},
				affectedObject: (row.affected_object as string | null) ?? undefined,
				resultStatus: String(row.result_status),
				approvalRequired: Boolean(row.approval_required),
				approvalId: (row.approval_id as string | null) ?? undefined,
				latencyMs: Number(row.latency_ms),
				errorCode: (row.error_code as string | null) ?? undefined,
				externalIds: (row.external_ids as Record<string, unknown>) ?? {},
				createdAt: String(row.created_at),
			})) satisfies AuditEntry[];
		},
		saveOpportunity: (ownerUserId, opportunity) => saveRecord(ownerUserId, 'opportunity', opportunity),
		listOpportunities: (ownerUserId, brandId) => listRecords<MarketingOpportunity>(ownerUserId, 'opportunity', brandId),
		getOpportunity: (ownerUserId, id) => loadRecord<MarketingOpportunity>(ownerUserId, 'opportunity', id),
		saveBrief: (ownerUserId, brief) => saveRecord(ownerUserId, 'brief', brief),
		getBrief: (ownerUserId, id) => loadRecord<AgentBriefRecord>(ownerUserId, 'brief', id),
		saveResearch: (ownerUserId, record) => saveRecord(ownerUserId, 'research', record),
		getResearch: (ownerUserId, id) => loadRecord<ResearchRecord>(ownerUserId, 'research', id),
		listResearch: (ownerUserId, brandId) => listRecords<ResearchRecord>(ownerUserId, 'research', brandId),
		saveMonitor: (ownerUserId, monitor) => saveRecord(ownerUserId, 'research_monitor', monitor),
		listMonitors: (ownerUserId, brandId) => listRecords<ResearchMonitor>(ownerUserId, 'research_monitor', brandId),
		saveInteraction: (ownerUserId, interaction) => saveRecord(ownerUserId, 'interaction', interaction),
		listInteractions: (ownerUserId, brandId) => listRecords<CommunityInteraction>(ownerUserId, 'interaction', brandId),
		listAllInteractions: (ownerUserId) => listRecords<CommunityInteraction>(ownerUserId, 'interaction'),
		getInteraction: (ownerUserId, id) => loadRecord<CommunityInteraction>(ownerUserId, 'interaction', id),
		saveAdProposal: (ownerUserId, proposal) => saveRecord(ownerUserId, 'ad_proposal', proposal),
		listAdProposals: (ownerUserId, brandId) => listRecords<AdChangeProposal>(ownerUserId, 'ad_proposal', brandId),
		async saveEvent(ownerUserId, event) {
			return saveRecord(ownerUserId, 'event', event);
		},
		async listEvents(ownerUserId, brandId) {
			return listRecords<AgentEvent>(ownerUserId, 'event', brandId);
		},
		saveFeedback: (ownerUserId, item) => saveRecord(ownerUserId, 'feedback', item),
		saveAsset: (ownerUserId, asset) => saveRecord(ownerUserId, 'asset', asset),
		getAsset: (ownerUserId, id) => loadRecord<ContentAsset>(ownerUserId, 'asset', id),
	};
}
