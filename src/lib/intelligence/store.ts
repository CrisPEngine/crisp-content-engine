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

export type IntelligenceStore = {
	upsertBrandBrain(
		userId: string,
		airtableBrandId: string,
		patch: Partial<Omit<BrandBrain, 'id' | 'userId' | 'airtableBrandId' | 'examples' | 'updatedAt'>>,
	): Promise<BrandBrain>;
	getBrandBrain(userId: string, airtableBrandId: string): Promise<BrandBrain | null>;
	getBrandBrainById(userId: string, id: string): Promise<BrandBrain | null>;
	listBrandBrains(userId: string): Promise<BrandBrain[]>;
	addExample(userId: string, example: Omit<BrandBrainExample, 'id'> & { brandBrainId: string }): Promise<BrandBrainExample>;

	upsertStrategy(userId: string, strategy: Omit<BrandStrategy, 'id' | 'campaigns' | 'channelStrategies'> & { id?: string }): Promise<BrandStrategy>;
	getStrategyForBrand(userId: string, brandBrainId: string): Promise<BrandStrategy | null>;
	upsertCampaign(userId: string, campaign: Omit<BrandCampaign, 'id'> & { id?: string }): Promise<BrandCampaign>;
	upsertChannelStrategy(userId: string, channel: Omit<ChannelStrategy, 'id'> & { id?: string }): Promise<ChannelStrategy>;

	createTheme(userId: string, theme: Omit<ContentTheme, 'id' | 'userId'> & { id?: string }): Promise<ContentTheme>;
	listThemes(userId: string, brandBrainId: string): Promise<ContentTheme[]>;
	getTheme(userId: string, themeId: string): Promise<ContentTheme | null>;
	saveThemePlan(userId: string, plan: Omit<ThemePlan, 'id'> & { id?: string }): Promise<ThemePlan>;
	getLatestThemePlan(userId: string, themeId: string): Promise<ThemePlan | null>;

	saveMemory(userId: string, record: Omit<ContentMemoryRecord, 'id' | 'userId' | 'createdAt'> & { id?: string; createdAt?: string }): Promise<ContentMemoryRecord>;
	listMemory(userId: string, brandBrainId: string): Promise<ContentMemoryRecord[]>;
	getMemory(userId: string, id: string): Promise<ContentMemoryRecord | null>;

	saveBrief(userId: string, brief: Omit<StoredBrief, 'id' | 'userId'> & { id?: string }): Promise<StoredBrief>;
	saveDraft(input: {
		userId: string;
		brandBrainId: string;
		briefId?: string;
		memoryId?: string;
		aiVersion: string;
		reviewedVersion?: string;
		userVersion?: string;
		reviewPayload?: Record<string, unknown>;
		scorePayload?: Record<string, unknown>;
	}): Promise<{ id: string }>;
	listDrafts(
		userId: string,
		memoryId: string,
	): Promise<Array<{ id: string; aiVersion: string; reviewedVersion?: string; userVersion?: string; createdAt?: string }>>;
	updateDraftUserVersion(userId: string, draftId: string, userVersion: string): Promise<{ aiVersion: string; userVersion: string } | null>;

	saveEditLearning(userId: string, learning: Omit<UserEditLearning, 'id'> & { id?: string }): Promise<UserEditLearning>;
	listEditLearnings(userId: string, brandBrainId: string): Promise<UserEditLearning[]>;
	updateEditLearning(
		userId: string,
		id: string,
		patch: Partial<Pick<UserEditLearning, 'status' | 'observation' | 'confidence'>>,
	): Promise<UserEditLearning | null>;

	savePerformance(userId: string, snapshot: Omit<PerformanceSnapshot, 'id'> & { brandBrainId: string }): Promise<PerformanceSnapshot>;
	listPerformance(userId: string, brandBrainId: string): Promise<Array<PerformanceSnapshot & { brandBrainId: string }>>;

	saveLearning(userId: string, learning: Omit<ContentLearning, 'id'> & { id?: string }): Promise<ContentLearning>;
	listLearnings(userId: string, brandBrainId: string): Promise<ContentLearning[]>;

	saveExperiment(userId: string, experiment: Omit<Experiment, 'id' | 'variants'> & { id?: string }): Promise<Experiment>;
	addVariant(userId: string, variant: Omit<ExperimentVariant, 'id'> & { id?: string }): Promise<ExperimentVariant>;
	getExperiment(userId: string, id: string): Promise<Experiment | null>;
	listExperiments(userId: string, brandBrainId: string): Promise<Experiment[]>;
	saveExperimentResult(
		userId: string,
		result: { experimentId: string; variantId: string; metric: string; absoluteValue?: number; normalisedValue?: number; sampleSize?: number },
	): Promise<void>;
	listExperimentResults(
		userId: string,
		experimentId: string,
	): Promise<Array<{ variantId: string; metric: string; absoluteValue?: number; normalisedValue?: number; sampleSize?: number }>>;
	updateExperiment(
		userId: string,
		id: string,
		patch: Partial<Pick<Experiment, 'status' | 'winnerVariantId' | 'confidence' | 'notes'>>,
	): Promise<Experiment | null>;

	enqueueJob(userId: string, job: Omit<WorkflowJob, 'id' | 'userId' | 'createdAt' | 'retryCount'> & { retryCount?: number }): Promise<WorkflowJob>;
	claimNextJob(): Promise<WorkflowJob | null>;
	updateJob(id: string, patch: Partial<WorkflowJob>): Promise<WorkflowJob | null>;
	listJobs(userId: string, brandBrainId?: string): Promise<WorkflowJob[]>;
};

export function nowIso(): string {
	return new Date().toISOString();
}

export function newId(): string {
	return crypto.randomUUID();
}
