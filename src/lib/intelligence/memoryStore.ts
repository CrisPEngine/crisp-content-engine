import type {
	BrandBrain,
	BrandBrainExample,
	BrandCampaign,
	BrandStrategy,
	ChannelStrategy,
	ContentLearning,
	ContentMemoryRecord,
	ContentTheme,
	Experiment,
	ExperimentVariant,
	PerformanceSnapshot,
	StoredBrief,
	ThemePlan,
	UserEditLearning,
	WorkflowJob,
} from './types';
import { newId, nowIso, type IntelligenceStore } from './store';

type DraftRow = {
	id: string;
	userId: string;
	brandBrainId: string;
	briefId?: string;
	memoryId?: string;
	aiVersion: string;
	reviewedVersion?: string;
	userVersion?: string;
	createdAt?: string;
};

type ExperimentResultRow = {
	experimentId: string;
	variantId: string;
	metric: string;
	absoluteValue?: number;
	normalisedValue?: number;
	sampleSize?: number;
};

export function createMemoryIntelligenceStore(): IntelligenceStore {
	const brains = new Map<string, BrandBrain>();
	const strategies = new Map<string, BrandStrategy>();
	const themes = new Map<string, ContentTheme>();
	const themePlans: ThemePlan[] = [];
	const memory = new Map<string, ContentMemoryRecord>();
	const briefs = new Map<string, StoredBrief>();
	const drafts = new Map<string, DraftRow>();
	const editLearnings = new Map<string, UserEditLearning>();
	const performance: Array<PerformanceSnapshot & { brandBrainId: string; userId: string }> = [];
	const learnings = new Map<string, ContentLearning>();
	const experiments = new Map<string, Experiment>();
	const experimentResults: ExperimentResultRow[] = [];
	const jobs = new Map<string, WorkflowJob>();

	const owned = <T extends { userId: string }>(row: T | undefined, userId: string): T | null =>
		row && row.userId === userId ? row : null;

	return {
		async upsertBrandBrain(userId, airtableBrandId, patch) {
			const existing = [...brains.values()].find(
				(row) => row.userId === userId && row.airtableBrandId === airtableBrandId,
			);
			const next: BrandBrain = existing
				? {
						...existing,
						identity: { ...existing.identity, ...patch.identity },
						voice: { ...existing.voice, ...patch.voice },
						guardrails: { ...existing.guardrails, ...patch.guardrails },
						knowledge: { ...existing.knowledge, ...patch.knowledge },
						updatedAt: nowIso(),
					}
				: {
						id: newId(),
						userId,
						airtableBrandId,
						identity: patch.identity ?? { name: airtableBrandId },
						voice: patch.voice ?? {},
						guardrails: patch.guardrails ?? {},
						knowledge: patch.knowledge ?? {},
						examples: [],
						updatedAt: nowIso(),
					};
			brains.set(next.id, next);
			return next;
		},

		async getBrandBrain(userId, airtableBrandId) {
			return (
				[...brains.values()].find(
					(row) => row.userId === userId && row.airtableBrandId === airtableBrandId,
				) ?? null
			);
		},

		async getBrandBrainById(userId, id) {
			return owned(brains.get(id), userId);
		},

		async addExample(userId, example) {
			const brain = owned(brains.get(example.brandBrainId), userId);
			if (!brain) throw new Error('Brand brain not found');
			const row: BrandBrainExample = { ...example, id: newId() };
			brain.examples.push(row);
			return row;
		},

		async upsertStrategy(userId, strategy) {
			const existing = strategy.id
				? owned(strategies.get(strategy.id), userId)
				: [...strategies.values()].find((row) => row.userId === userId && row.brandBrainId === strategy.brandBrainId);
			const next: BrandStrategy = {
				campaigns: existing?.campaigns ?? [],
				channelStrategies: existing?.channelStrategies ?? [],
				...strategy,
				id: existing?.id ?? newId(),
				userId,
			};
			strategies.set(next.id, next);
			return next;
		},

		async getStrategyForBrand(userId, brandBrainId) {
			return (
				[...strategies.values()].find((row) => row.userId === userId && row.brandBrainId === brandBrainId) ??
				null
			);
		},

		async upsertCampaign(userId, campaign) {
			const strategy = owned(strategies.get(campaign.strategyId), userId);
			if (!strategy) throw new Error('Strategy not found');
			const next: BrandCampaign = { ...campaign, id: campaign.id ?? newId() };
			strategy.campaigns = [...strategy.campaigns.filter((row) => row.id !== next.id), next];
			return next;
		},

		async upsertChannelStrategy(userId, channel) {
			const strategy = owned(strategies.get(channel.strategyId), userId);
			if (!strategy) throw new Error('Strategy not found');
			const next: ChannelStrategy = { ...channel, id: channel.id ?? newId() };
			strategy.channelStrategies = [
				...strategy.channelStrategies.filter((row) => row.channel !== next.channel),
				next,
			];
			return next;
		},

		async createTheme(userId, theme) {
			const next: ContentTheme = { ...theme, id: theme.id ?? newId(), userId };
			themes.set(next.id, next);
			return next;
		},

		async listThemes(userId, brandBrainId) {
			return [...themes.values()].filter((row) => row.userId === userId && row.brandBrainId === brandBrainId);
		},

		async getTheme(userId, themeId) {
			return owned(themes.get(themeId), userId);
		},

		async saveThemePlan(userId, plan) {
			const theme = owned(themes.get(plan.themeId), userId);
			if (!theme) throw new Error('Theme not found');
			const next: ThemePlan = { ...plan, id: plan.id ?? newId() };
			themePlans.push(next);
			return next;
		},

		async getLatestThemePlan(userId, themeId) {
			const theme = owned(themes.get(themeId), userId);
			if (!theme) return null;
			return [...themePlans].reverse().find((row) => row.themeId === themeId) ?? null;
		},

		async saveMemory(userId, record) {
			const next: ContentMemoryRecord = {
				...record,
				id: record.id ?? newId(),
				userId,
				createdAt: record.createdAt ?? nowIso(),
			};
			memory.set(next.id, next);
			return next;
		},

		async listMemory(userId, brandBrainId) {
			return [...memory.values()]
				.filter((row) => row.userId === userId && row.brandBrainId === brandBrainId)
				.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		},

		async getMemory(userId, id) {
			return owned(memory.get(id), userId);
		},

		async saveBrief(userId, brief) {
			const next: StoredBrief = { ...brief, id: brief.id ?? newId(), userId };
			briefs.set(next.id, next);
			return next;
		},

		async saveDraft(input) {
			const row: DraftRow = { id: newId(), createdAt: nowIso(), ...input };
			drafts.set(row.id, row);
			return { id: row.id };
		},

		async listDrafts(userId, memoryId) {
			return [...drafts.values()]
				.filter((row) => row.userId === userId && row.memoryId === memoryId)
				.map((row) => ({
					id: row.id,
					aiVersion: row.aiVersion,
					reviewedVersion: row.reviewedVersion,
					userVersion: row.userVersion,
					createdAt: row.createdAt,
				}));
		},

		async updateDraftUserVersion(userId, draftId, userVersion) {
			const row = drafts.get(draftId);
			if (!row || row.userId !== userId) return null;
			row.userVersion = userVersion;
			return { aiVersion: row.aiVersion, userVersion };
		},

		async saveEditLearning(userId, learning) {
			const existing = learning.id ? editLearnings.get(learning.id) : undefined;
			const next: UserEditLearning = { ...learning, id: existing?.id ?? newId() };
			if (userId) {
				// ownership is implied by brand_brain in API layer
			}
			editLearnings.set(next.id, next);
			return next;
		},

		async listEditLearnings(_userId, brandBrainId) {
			return [...editLearnings.values()].filter((row) => row.brandBrainId === brandBrainId);
		},

		async updateEditLearning(_userId, id, patch) {
			const row = editLearnings.get(id);
			if (!row) return null;
			const next = { ...row, ...patch };
			editLearnings.set(id, next);
			return next;
		},

		async savePerformance(userId, snapshot) {
			const next = { ...snapshot, id: newId(), userId };
			performance.push(next);
			return next;
		},

		async listPerformance(userId, brandBrainId) {
			return performance
				.filter((row) => row.userId === userId && row.brandBrainId === brandBrainId)
				.sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
		},

		async saveLearning(_userId, learning) {
			const next: ContentLearning = { ...learning, id: learning.id ?? newId() };
			learnings.set(next.id, next);
			return next;
		},

		async listLearnings(_userId, brandBrainId) {
			return [...learnings.values()].filter((row) => row.brandBrainId === brandBrainId);
		},

		async saveExperiment(_userId, experiment) {
			const next: Experiment = { ...experiment, id: experiment.id ?? newId(), variants: [] };
			experiments.set(next.id, next);
			return next;
		},

		async addVariant(_userId, variant) {
			const experiment = experiments.get(variant.experimentId);
			if (!experiment) throw new Error('Experiment not found');
			const next: ExperimentVariant = { ...variant, id: variant.id ?? newId() };
			experiment.variants = [...experiment.variants.filter((row) => row.id !== next.id), next];
			return next;
		},

		async getExperiment(_userId, id) {
			return experiments.get(id) ?? null;
		},

		async listExperiments(_userId, brandBrainId) {
			return [...experiments.values()].filter((row) => row.brandBrainId === brandBrainId);
		},

		async saveExperimentResult(_userId, result) {
			experimentResults.push(result);
		},

		async listExperimentResults(_userId, experimentId) {
			return experimentResults.filter((row) => row.experimentId === experimentId);
		},

		async updateExperiment(_userId, id, patch) {
			const row = experiments.get(id);
			if (!row) return null;
			const next = { ...row, ...patch };
			experiments.set(id, next);
			return next;
		},

		async enqueueJob(userId, job) {
			const next: WorkflowJob = {
				...job,
				id: newId(),
				userId,
				retryCount: job.retryCount ?? 0,
				createdAt: nowIso(),
			};
			jobs.set(next.id, next);
			return next;
		},

		async claimNextJob() {
			const queued = [...jobs.values()]
				.filter((row) => row.status === 'queued' || row.status === 'retrying')
				.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
			if (!queued) return null;
			queued.status = 'processing';
			queued.startedAt = nowIso();
			return queued;
		},

		async updateJob(id, patch) {
			const row = jobs.get(id);
			if (!row) return null;
			Object.assign(row, patch);
			return row;
		},

		async listJobs(userId, brandBrainId) {
			return [...jobs.values()].filter(
				(row) => row.userId === userId && (!brandBrainId || row.brandBrainId === brandBrainId),
			);
		},
	};
}
