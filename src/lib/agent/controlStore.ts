import { createSupabaseAgentStore } from './supabaseControlStore';
import type {
	AdChangeProposal,
	AgentBriefRecord,
	AgentControlStore,
	AgentCredential,
	AgentEvent,
	AgentFeedback,
	AuditEntry,
	CommunityInteraction,
	ContentAsset,
	IdempotencyRecord,
	MarketingOpportunity,
	ResearchRecord,
} from './types';

type Owned<T> = { ownerUserId: string; value: T };

export function createMemoryAgentStore(): AgentControlStore {
	const credentials = new Map<string, AgentCredential>();
	const idempotency = new Map<string, IdempotencyRecord>();
	const rates = new Map<string, { count: number; resetAt: number }>();
	const costs = new Map<string, number>();
	const audit: AuditEntry[] = [];
	const opportunities = new Map<string, Owned<MarketingOpportunity>>();
	const briefs = new Map<string, Owned<AgentBriefRecord>>();
	const research = new Map<string, Owned<ResearchRecord>>();
	const interactions = new Map<string, Owned<CommunityInteraction>>();
	const ads = new Map<string, Owned<AdChangeProposal>>();
	const events: Array<Owned<AgentEvent>> = [];
	const feedback: Array<Owned<AgentFeedback>> = [];
	const assets = new Map<string, Owned<ContentAsset>>();

	return {
		async insertCredential(credential) {
			credentials.set(credential.id, credential);
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
			const next = (costs.get(key) ?? 0) + usd;
			costs.set(key, next);
			return next;
		},
		async costToday(credentialId) {
			return costs.get(`${credentialId}:${new Date().toISOString().slice(0, 10)}`) ?? 0;
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
		async saveInteraction(ownerUserId, interaction) {
			interactions.set(interaction.id, { ownerUserId, value: interaction });
			return interaction;
		},
		async listInteractions(ownerUserId, brandId) {
			return [...interactions.values()]
				.filter((row) => row.ownerUserId === ownerUserId && row.value.brandId === brandId)
				.map((row) => row.value);
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
