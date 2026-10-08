import { createSupabaseAgentStore } from './supabaseControlStore';
import type {
	AdChangeProposal,
	AgentBriefRecord,
	AgentControlStore,
	AgentCredential,
	AgentEvent,
	ApprovalRequest,
	AgentFeedback,
	AuditEntry,
	CommunityInteraction,
	ContentAsset,
	IdempotencyRecord,
	MarketingOpportunity,
	ResearchRecord,
	ResearchMonitor,
} from './types';

type Owned<T> = { ownerUserId: string; value: T };

export function createMemoryAgentStore(): AgentControlStore {
	const credentials = new Map<string, AgentCredential>();
	const idempotency = new Map<string, IdempotencyRecord>();
	const rates = new Map<string, { count: number; resetAt: number }>();
		const costs = new Map<string, { usd: number; imageUsd: number }>();
	const audit: AuditEntry[] = [];
	const opportunities = new Map<string, Owned<MarketingOpportunity>>();
	const briefs = new Map<string, Owned<AgentBriefRecord>>();
	const research = new Map<string, Owned<ResearchRecord>>();
	const monitors = new Map<string, Owned<ResearchMonitor>>();
	const interactions = new Map<string, Owned<CommunityInteraction>>();
	const ads = new Map<string, Owned<AdChangeProposal>>();
	const events: Array<Owned<AgentEvent>> = [];
	const feedback: Array<Owned<AgentFeedback>> = [];
	const assets = new Map<string, Owned<ContentAsset>>();
	const approvals = new Map<string, ApprovalRequest>();

	return {
		async insertCredential(credential) {
			credentials.set(credential.id, { ...credential, scope: credential.scope ?? 'BRAND' });
		},
		async saveApprovalRequest(request) {
			approvals.set(request.id, request);
			return request;
		},
		async getApprovalRequest(id) {
			return approvals.get(id) ?? null;
		},
		async getApprovalRequestByTokenHash(tokenHash) {
			return [...approvals.values()].find((row) => row.tokenHash === tokenHash) ?? null;
		},
		async listApprovalRequests(ownerUserId, status) {
			return [...approvals.values()].filter((row) => row.ownerUserId === ownerUserId && (!status || row.status === status));
		},
		async updateCredential(id, patch) {
			const current = credentials.get(id);
			if (!current) return;
			credentials.set(id, { ...current, ...patch });
		},
		async findCredentialByHash(keyHash) {
			return [...credentials.values()].find((row) => row.keyHash === keyHash) ?? null;
		},
		async listCredentials(ownerUserId) {
			return [...credentials.values()].filter((row) => row.ownerUserId === ownerUserId);
		},
		async getCredential(ownerUserId, id) {
			const row = credentials.get(id);
			return row && row.ownerUserId === ownerUserId ? row : null;
		},
		async readIdempotency(credentialId, key) {
			return idempotency.get(`${credentialId}:${key}`) ?? null;
		},
		async writeIdempotency(record) {
			idempotency.set(`${record.credentialId}:${record.idempotencyKey}`, record);
		},
		async consumeRate(credentialId, windowKey, limit, windowMs) {
			const key = `${credentialId}:${windowKey}`;
			const now = Date.now();
			const existing = rates.get(key);
			if (!existing || existing.resetAt <= now) {
				rates.set(key, { count: 1, resetAt: now + windowMs });
				return { allowed: 1 <= limit, count: 1 };
			}
			existing.count += 1;
			return { allowed: existing.count <= limit, count: existing.count };
		},
		async addCost(credentialId, usd) {
			const key = `${credentialId}:${new Date().toISOString().slice(0, 10)}`;
			const current = costs.get(key) ?? { usd: 0, imageUsd: 0 };
			current.usd += usd;
			costs.set(key, current);
			return current.usd;
		},
		async costToday(credentialId) {
			return costs.get(`${credentialId}:${new Date().toISOString().slice(0, 10)}`)?.usd ?? 0;
		},
		async addImageCost(credentialId, usd) {
			const key = `${credentialId}:${new Date().toISOString().slice(0, 10)}`;
			const current = costs.get(key) ?? { usd: 0, imageUsd: 0 };
			current.usd += usd;
			current.imageUsd += usd;
			costs.set(key, current);
			return current.imageUsd;
		},
		async imageCostToday(credentialId) {
			return costs.get(`${credentialId}:${new Date().toISOString().slice(0, 10)}`)?.imageUsd ?? 0;
		},
		async writeAudit(entry) {
			audit.push(entry);
		},
		async listAudit(ownerUserId, credentialId) {
			return audit.filter((row) => row.ownerUserId === ownerUserId && (!credentialId || row.credentialId === credentialId));
		},
		async saveOpportunity(ownerUserId, opportunity) {
			opportunities.set(opportunity.id, { ownerUserId, value: opportunity });
			return opportunity;
		},
		async listOpportunities(ownerUserId, brandId) {
			return [...opportunities.values()]
				.filter((row) => row.ownerUserId === ownerUserId && row.value.brandId === brandId)
				.map((row) => row.value);
		},
		async getOpportunity(ownerUserId, id) {
			const row = opportunities.get(id);
			return row && row.ownerUserId === ownerUserId ? row.value : null;
		},
		async saveBrief(ownerUserId, brief) {
			briefs.set(brief.id, { ownerUserId, value: brief });
			return brief;
		},
		async getBrief(ownerUserId, id) {
			const row = briefs.get(id);
			return row && row.ownerUserId === ownerUserId ? row.value : null;
		},
		async saveResearch(ownerUserId, record) {
			research.set(record.id, { ownerUserId, value: record });
			return record;
		},
		async getResearch(ownerUserId, id) {
			const row = research.get(id);
			return row && row.ownerUserId === ownerUserId ? row.value : null;
		},
		async listResearch(ownerUserId, brandId) {
			return [...research.values()]
				.filter((row) => row.ownerUserId === ownerUserId && row.value.brandId === brandId)
				.map((row) => row.value);
		},
		async saveMonitor(ownerUserId, monitor) {
			monitors.set(monitor.id, { ownerUserId, value: monitor });
			return monitor;
		},
		async listMonitors(ownerUserId, brandId) {
			return [...monitors.values()]
				.filter((row) => row.ownerUserId === ownerUserId && row.value.brandId === brandId)
				.map((row) => row.value);
		},
		async saveInteraction(ownerUserId, interaction) {
			interactions.set(interaction.id, { ownerUserId, value: interaction });
			return interaction;
		},
		async listInteractions(ownerUserId, brandId) {
			return [...interactions.values()]
				.filter((row) => row.ownerUserId === ownerUserId && row.value.brandId === brandId)
				.map((row) => row.value);
		},
		async listAllInteractions(ownerUserId) {
			return [...interactions.values()].filter((row) => row.ownerUserId === ownerUserId).map((row) => row.value);
		},
		async getInteraction(ownerUserId, id) {
			const row = interactions.get(id);
			return row && row.ownerUserId === ownerUserId ? row.value : null;
		},
		async saveAdProposal(ownerUserId, proposal) {
			ads.set(proposal.id, { ownerUserId, value: proposal });
			return proposal;
		},
		async listAdProposals(ownerUserId, brandId) {
			return [...ads.values()]
				.filter((row) => row.ownerUserId === ownerUserId && row.value.brandId === brandId)
				.map((row) => row.value);
		},
		async saveEvent(ownerUserId, event) {
			events.push({ ownerUserId, value: event });
			return event;
		},
		async listEvents(ownerUserId, brandId) {
			return events
				.filter((row) => row.ownerUserId === ownerUserId && (!brandId || row.value.brandId === brandId))
				.map((row) => row.value);
		},
		async saveFeedback(ownerUserId, item) {
			feedback.push({ ownerUserId, value: item });
			return item;
		},
		async saveAsset(ownerUserId, asset) {
			assets.set(asset.id, { ownerUserId, value: asset });
			return asset;
		},
		async getAsset(ownerUserId, id) {
			const row = assets.get(id);
			return row && row.ownerUserId === ownerUserId ? row.value : null;
		},
	};
}

let override: AgentControlStore | undefined;

export function setAgentStoreForTests(store?: AgentControlStore): void {
	override = store;
}

export function getAgentStore(): AgentControlStore {
	if (override) return override;
	return createSupabaseAgentStore();
}
