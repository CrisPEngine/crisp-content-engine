import { getSupabaseService } from '@/lib/supabaseService';
import type {
	BrandBrain,
	BrandCampaign,
	BrandStrategy,
	ChannelStrategy,
	ContentLearning,
	ContentMemoryRecord,
	ContentTheme,
	Experiment,
	StoredBrief,
	ThemePlan,
	UserEditLearning,
	WorkflowJob,
} from './types';
import { newId, nowIso, type IntelligenceStore } from './store';

function db() {
	return getSupabaseService();
}

function asArray<T>(value: unknown): T[] {
	return Array.isArray(value) ? (value as T[]) : [];
}

function mapBrain(row: Record<string, unknown>, examples: BrandBrain['examples']): BrandBrain {
	return {
		id: String(row.id),
		userId: String(row.user_id),
		airtableBrandId: String(row.airtable_brand_id),
		identity: (row.identity as BrandBrain['identity']) || { name: '' },
		voice: (row.voice as BrandBrain['voice']) || {},
		guardrails: (row.guardrails as BrandBrain['guardrails']) || {},
		knowledge: (row.knowledge as BrandBrain['knowledge']) || {},
		examples,
		updatedAt: String(row.updated_at ?? nowIso()),
	};
}

function mapStrategy(row: Record<string, unknown>, campaigns: BrandCampaign[], channelStrategies: ChannelStrategy[]): BrandStrategy {
	return {
		id: String(row.id),
		userId: String(row.user_id),
		brandBrainId: String(row.brand_brain_id),
		airtableBrandId: String(row.airtable_brand_id),
		status: String(row.status ?? 'draft'),
		objectives: asArray(row.objectives),
		audiences: asArray(row.audiences),
		audienceProblems: asArray(row.audience_problems),
		desiredOutcomes: asArray(row.desired_outcomes),
		positioning: row.positioning ? String(row.positioning) : undefined,
		keyMessages: asArray(row.key_messages),
		proofPoints: asArray(row.proof_points),
		contentPillars: asArray(row.content_pillars),
		funnelStages: asArray(row.funnel_stages),
		ctaStrategy: (row.cta_strategy as Record<string, unknown>) || {},
		contentMix: (row.content_mix as Record<string, unknown>) || {},
		editorialThemes: asArray(row.editorial_themes),
		campaigns,
		channelStrategies,
	};
}

function mapTheme(row: Record<string, unknown>): ContentTheme {
	return {
		id: String(row.id),
		userId: String(row.user_id),
		brandBrainId: String(row.brand_brain_id),
		strategyId: row.strategy_id ? String(row.strategy_id) : undefined,
		title: String(row.title),
		description: row.description ? String(row.description) : undefined,
		objective: row.objective ? String(row.objective) : undefined,
		targetAudience: row.target_audience ? String(row.target_audience) : undefined,
		relatedPillars: asArray(row.related_pillars),
		keyArguments: asArray(row.key_arguments),
		subtopics: asArray(row.subtopics),
		questionsToAnswer: asArray(row.questions_to_answer),
		proofPoints: asArray(row.proof_points),
		keywords: asArray(row.keywords),
		channels: asArray(row.channels),
		desiredFrequency: row.desired_frequency ? String(row.desired_frequency) : undefined,
		startDate: row.start_date ? String(row.start_date) : undefined,
		endDate: row.end_date ? String(row.end_date) : undefined,
		status: String(row.status ?? 'active'),
	};
}

function mapMemory(row: Record<string, unknown>): ContentMemoryRecord {
	return {
		id: String(row.id),
		userId: String(row.user_id),
		brandBrainId: String(row.brand_brain_id),
		airtableContentId: row.airtable_content_id ? String(row.airtable_content_id) : undefined,
		themeId: row.theme_id ? String(row.theme_id) : undefined,
		campaignId: row.campaign_id ? String(row.campaign_id) : undefined,
		strategyId: row.strategy_id ? String(row.strategy_id) : undefined,
		briefId: row.brief_id ? String(row.brief_id) : undefined,
		parentMemoryId: row.parent_memory_id ? String(row.parent_memory_id) : undefined,
		experimentId: row.experiment_id ? String(row.experiment_id) : undefined,
		channel: String(row.channel),
		contentType: row.content_type ? String(row.content_type) : undefined,
		contentPillar: row.content_pillar ? String(row.content_pillar) : undefined,
		topic: row.topic ? String(row.topic) : undefined,
		angle: row.angle ? String(row.angle) : undefined,
		hook: row.hook ? String(row.hook) : undefined,
		argument: row.argument ? String(row.argument) : undefined,
		cta: row.cta ? String(row.cta) : undefined,
		format: row.format ? String(row.format) : undefined,
		body: row.body ? String(row.body) : undefined,
		publicationStatus: String(row.publication_status ?? 'draft'),
		publicationDate: row.publication_date ? String(row.publication_date) : undefined,
		destination: row.destination ? String(row.destination) : undefined,
		sourceIdea: row.source_idea ? String(row.source_idea) : undefined,
		externalPostId: row.external_post_id ? String(row.external_post_id) : undefined,
		externalUrl: row.external_url ? String(row.external_url) : undefined,
		metadata: (row.metadata as Record<string, unknown> | undefined) ?? {},
		createdAt: String(row.created_at ?? nowIso()),
	};
}

function mapJob(row: Record<string, unknown>): WorkflowJob {
	return {
		id: String(row.id),
		userId: String(row.user_id),
		brandBrainId: row.brand_brain_id ? String(row.brand_brain_id) : undefined,
		jobType: String(row.job_type),
		status: row.status as WorkflowJob['status'],
		payload: (row.payload as Record<string, unknown>) || {},
		referenceId: row.reference_id ? String(row.reference_id) : undefined,
		retryCount: Number(row.retry_count ?? 0),
		maxRetries: Number(row.max_retries ?? 3),
		lastError: row.last_error ? String(row.last_error) : undefined,
		createdAt: String(row.created_at),
		startedAt: row.started_at ? String(row.started_at) : undefined,
		completedAt: row.completed_at ? String(row.completed_at) : undefined,
	};
}

export function createSupabaseIntelligenceStore(): IntelligenceStore {
	return {
		async upsertBrandBrain(userId, airtableBrandId, patch) {
			const existing = await this.getBrandBrain(userId, airtableBrandId);
			const payload = {
				user_id: userId,
				airtable_brand_id: airtableBrandId,
				identity: { ...(existing?.identity ?? { name: airtableBrandId }), ...patch.identity },
				voice: { ...(existing?.voice ?? {}), ...patch.voice },
				guardrails: { ...(existing?.guardrails ?? {}), ...patch.guardrails },
				knowledge: { ...(existing?.knowledge ?? {}), ...patch.knowledge },
			};
			const { data, error } = await db()
				.from('brand_brains')
				.upsert(payload, { onConflict: 'user_id,airtable_brand_id' })
				.select()
				.single();
			if (error || !data) throw new Error(error?.message || 'Failed to upsert brand brain');
			return mapBrain(data, existing?.examples ?? []);
		},

		async getBrandBrain(userId, airtableBrandId) {
			const { data, error } = await db()
				.from('brand_brains')
				.select('*')
				.eq('user_id', userId)
				.eq('airtable_brand_id', airtableBrandId)
				.maybeSingle();
			if (error) throw new Error(error.message);
			if (!data) return null;
			const { data: examples } = await db()
				.from('brand_brain_examples')
				.select('*')
				.eq('brand_brain_id', data.id)
				.eq('user_id', userId);
			return mapBrain(data, (examples ?? []).map((row) => ({
				id: row.id,
				kind: row.kind,
				channel: row.channel,
				contentType: row.content_type,
				body: row.body,
				whyItWorks: row.why_it_works,
				metadata: row.metadata ?? {},
			})));
		},

		async getBrandBrainById(userId, id) {
			const { data, error } = await db().from('brand_brains').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
			if (error) throw new Error(error.message);
			if (!data) return null;
			const { data: examples } = await db().from('brand_brain_examples').select('*').eq('brand_brain_id', id);
			return mapBrain(data, (examples ?? []).map((row) => ({
				id: row.id,
				kind: row.kind,
				channel: row.channel,
				contentType: row.content_type,
				body: row.body,
				whyItWorks: row.why_it_works,
				metadata: row.metadata ?? {},
			})));
		},

		async addExample(userId, example) {
			const { data, error } = await db()
				.from('brand_brain_examples')
				.insert({
					user_id: userId,
					brand_brain_id: example.brandBrainId,
					kind: example.kind,
					channel: example.channel ?? null,
					content_type: example.contentType ?? null,
					body: example.body,
					why_it_works: example.whyItWorks ?? null,
					metadata: example.metadata ?? {},
				})
				.select()
				.single();
			if (error || !data) throw new Error(error?.message || 'Failed to add example');
			return {
				id: data.id,
				kind: data.kind,
				channel: data.channel,
				contentType: data.content_type,
				body: data.body,
				whyItWorks: data.why_it_works,
				metadata: data.metadata ?? {},
			};
		},

		async upsertStrategy(userId, strategy) {
			const payload = {
				id: strategy.id ?? newId(),
				user_id: userId,
				brand_brain_id: strategy.brandBrainId,
				airtable_brand_id: strategy.airtableBrandId,
				status: strategy.status,
				objectives: strategy.objectives,
				audiences: strategy.audiences,
				audience_problems: strategy.audienceProblems,
				desired_outcomes: strategy.desiredOutcomes,
				positioning: strategy.positioning ?? null,
				key_messages: strategy.keyMessages,
				proof_points: strategy.proofPoints,
				content_pillars: strategy.contentPillars,
				funnel_stages: strategy.funnelStages,
				cta_strategy: strategy.ctaStrategy,
				content_mix: strategy.contentMix,
				editorial_themes: strategy.editorialThemes,
			};
			const { data, error } = await db().from('brand_strategies').upsert(payload).select().single();
			if (error || !data) throw new Error(error?.message || 'Failed to upsert strategy');
			return this.getStrategyForBrand(userId, strategy.brandBrainId) as Promise<BrandStrategy>;
		},

		async getStrategyForBrand(userId, brandBrainId) {
			const { data, error } = await db()
				.from('brand_strategies')
				.select('*')
				.eq('user_id', userId)
				.eq('brand_brain_id', brandBrainId)
				.maybeSingle();
			if (error) throw new Error(error.message);
			if (!data) return null;
			const [{ data: campaigns }, { data: channels }] = await Promise.all([
				db().from('brand_campaigns').select('*').eq('strategy_id', data.id),
				db().from('brand_channel_strategies').select('*').eq('strategy_id', data.id),
			]);
			return mapStrategy(
				data,
				(campaigns ?? []).map((row) => ({
					id: row.id,
					strategyId: row.strategy_id,
					title: row.title,
					objective: row.objective,
					description: row.description,
					startDate: row.start_date,
					endDate: row.end_date,
					status: row.status,
				})),
				(channels ?? []).map((row) => ({
					id: row.id,
					strategyId: row.strategy_id,
					channel: row.channel,
					role: row.role,
					cadence: row.cadence,
					formats: row.formats ?? [],
					ctaNotes: row.cta_notes,
					constraints: row.constraints ?? [],
				})),
			);
		},

		async upsertCampaign(userId, campaign) {
			const { data, error } = await db()
				.from('brand_campaigns')
				.upsert({
					id: campaign.id ?? newId(),
					user_id: userId,
					strategy_id: campaign.strategyId,
					title: campaign.title,
					objective: campaign.objective ?? null,
					description: campaign.description ?? null,
					start_date: campaign.startDate ?? null,
					end_date: campaign.endDate ?? null,
					status: campaign.status,
				})
				.select()
				.single();
			if (error || !data) throw new Error(error?.message || 'Failed to upsert campaign');
			return {
				id: data.id,
				strategyId: data.strategy_id,
				title: data.title,
				objective: data.objective,
				description: data.description,
				startDate: data.start_date,
				endDate: data.end_date,
				status: data.status,
			};
		},

		async upsertChannelStrategy(userId, channel) {
			const { data, error } = await db()
				.from('brand_channel_strategies')
				.upsert({
					id: channel.id ?? newId(),
					user_id: userId,
					strategy_id: channel.strategyId,
					channel: channel.channel,
					role: channel.role ?? null,
					cadence: channel.cadence ?? null,
					formats: channel.formats,
					cta_notes: channel.ctaNotes ?? null,
					constraints: channel.constraints,
				})
				.select()
				.single();
			if (error || !data) throw new Error(error?.message || 'Failed to upsert channel strategy');
			return {
				id: data.id,
				strategyId: data.strategy_id,
				channel: data.channel,
				role: data.role,
				cadence: data.cadence,
				formats: data.formats ?? [],
				ctaNotes: data.cta_notes,
				constraints: data.constraints ?? [],
			};
		},

		async createTheme(userId, theme) {
			const { data, error } = await db()
				.from('content_themes')
				.upsert({
					id: theme.id ?? newId(),
					user_id: userId,
					brand_brain_id: theme.brandBrainId,
					strategy_id: theme.strategyId ?? null,
					title: theme.title,
					description: theme.description ?? null,
					objective: theme.objective ?? null,
					target_audience: theme.targetAudience ?? null,
					related_pillars: theme.relatedPillars,
					key_arguments: theme.keyArguments,
					subtopics: theme.subtopics,
					questions_to_answer: theme.questionsToAnswer,
					proof_points: theme.proofPoints,
					keywords: theme.keywords,
					channels: theme.channels,
					desired_frequency: theme.desiredFrequency ?? null,
					start_date: theme.startDate ?? null,
					end_date: theme.endDate ?? null,
					status: theme.status,
				})
				.select()
				.single();
			if (error || !data) throw new Error(error?.message || 'Failed to save theme');
			return mapTheme(data);
		},

		async listThemes(userId, brandBrainId) {
			const { data, error } = await db()
				.from('content_themes')
				.select('*')
				.eq('user_id', userId)
				.eq('brand_brain_id', brandBrainId)
				.order('created_at', { ascending: false });
			if (error) throw new Error(error.message);
			return (data ?? []).map(mapTheme);
		},

		async getTheme(userId, themeId) {
			const { data, error } = await db().from('content_themes').select('*').eq('id', themeId).eq('user_id', userId).maybeSingle();
			if (error) throw new Error(error.message);
			return data ? mapTheme(data) : null;
		},

		async saveThemePlan(userId, plan) {
			const { data, error } = await db()
				.from('content_theme_plans')
				.insert({
					id: plan.id ?? newId(),
					user_id: userId,
					theme_id: plan.themeId,
					core_idea: plan.coreIdea,
					horizon_weeks: plan.horizonWeeks,
					pieces: plan.pieces,
					rationale: plan.rationale ?? null,
				})
				.select()
				.single();
			if (error || !data) throw new Error(error?.message || 'Failed to save theme plan');
			return {
				id: data.id,
				themeId: data.theme_id,
				coreIdea: data.core_idea,
				horizonWeeks: data.horizon_weeks,
				pieces: data.pieces ?? [],
				rationale: data.rationale,
			};
		},

		async getLatestThemePlan(userId, themeId) {
			const { data, error } = await db()
				.from('content_theme_plans')
				.select('*')
				.eq('user_id', userId)
				.eq('theme_id', themeId)
				.order('created_at', { ascending: false })
				.limit(1)
				.maybeSingle();
			if (error) throw new Error(error.message);
			if (!data) return null;
			return {
				id: data.id,
				themeId: data.theme_id,
				coreIdea: data.core_idea,
				horizonWeeks: data.horizon_weeks,
				pieces: data.pieces ?? [],
				rationale: data.rationale,
			} satisfies ThemePlan;
		},

		async saveMemory(userId, record) {
			const { data, error } = await db()
				.from('content_memory')
				.upsert({
					id: record.id ?? newId(),
					user_id: userId,
					brand_brain_id: record.brandBrainId,
					airtable_content_id: record.airtableContentId ?? null,
					theme_id: record.themeId ?? null,
					campaign_id: record.campaignId ?? null,
					strategy_id: record.strategyId ?? null,
					brief_id: record.briefId ?? null,
					parent_memory_id: record.parentMemoryId ?? null,
					experiment_id: record.experimentId ?? null,
					channel: record.channel,
					content_type: record.contentType ?? null,
					content_pillar: record.contentPillar ?? null,
					topic: record.topic ?? null,
					angle: record.angle ?? null,
					hook: record.hook ?? null,
					argument: record.argument ?? null,
					cta: record.cta ?? null,
					format: record.format ?? null,
					body: record.body ?? null,
					publication_status: record.publicationStatus,
					publication_date: record.publicationDate ?? null,
					destination: record.destination ?? null,
					source_idea: record.sourceIdea ?? null,
					external_post_id: record.externalPostId ?? null,
					external_url: record.externalUrl ?? null,
					metadata: record.metadata ?? {},
				})
				.select()
				.single();
			if (error || !data) throw new Error(error?.message || 'Failed to save memory');
			return mapMemory(data);
		},

		async listMemory(userId, brandBrainId) {
			const { data, error } = await db()
				.from('content_memory')
				.select('*')
				.eq('user_id', userId)
				.eq('brand_brain_id', brandBrainId)
				.order('created_at', { ascending: false })
				.limit(100);
			if (error) throw new Error(error.message);
			return (data ?? []).map(mapMemory);
		},

		async getMemory(userId, id) {
			const { data, error } = await db().from('content_memory').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
			if (error) throw new Error(error.message);
			return data ? mapMemory(data) : null;
		},

		async saveBrief(userId, brief) {
			const { data, error } = await db()
				.from('native_content_briefs')
				.insert({
					id: brief.id ?? newId(),
					user_id: userId,
					brand_brain_id: brief.brandBrainId,
					strategy_id: brief.strategyId ?? null,
					theme_id: brief.themeId ?? null,
					campaign_id: brief.campaignId ?? null,
					memory_id: brief.memoryId ?? null,
					payload: brief.payload,
					user_intent: brief.userIntent,
				})
				.select()
				.single();
			if (error || !data) throw new Error(error?.message || 'Failed to save brief');
			return {
				id: data.id,
				userId,
				brandBrainId: data.brand_brain_id,
				userIntent: data.user_intent,
				payload: data.payload,
				themeId: data.theme_id,
				strategyId: data.strategy_id,
				campaignId: data.campaign_id,
				memoryId: data.memory_id,
			} satisfies StoredBrief;
		},

		async listDrafts(userId, memoryId) {
			const { data, error } = await db()
				.from('content_drafts')
				.select('id,ai_version,reviewed_version,user_version,created_at')
				.eq('user_id', userId)
				.eq('memory_id', memoryId)
				.order('created_at', { ascending: true });
			if (error) throw new Error(error.message);
			return (data ?? []).map((row) => ({
				id: row.id as string,
				aiVersion: row.ai_version as string,
				reviewedVersion: (row.reviewed_version as string | null) ?? undefined,
				userVersion: (row.user_version as string | null) ?? undefined,
				createdAt: row.created_at as string,
			}));
		},

		async saveDraft(input) {
			const { data, error } = await db()
				.from('content_drafts')
				.insert({
					user_id: input.userId,
					brand_brain_id: input.brandBrainId,
					brief_id: input.briefId ?? null,
					memory_id: input.memoryId ?? null,
					ai_version: input.aiVersion,
					reviewed_version: input.reviewedVersion ?? null,
					user_version: input.userVersion ?? null,
					review_payload: input.reviewPayload ?? {},
					score_payload: input.scorePayload ?? {},
				})
				.select('id')
				.single();
			if (error || !data) throw new Error(error?.message || 'Failed to save draft');
			return { id: data.id };
		},

		async updateDraftUserVersion(userId, draftId, userVersion) {
			const { data, error } = await db()
				.from('content_drafts')
				.update({ user_version: userVersion })
				.eq('id', draftId)
				.eq('user_id', userId)
				.select('ai_version,user_version')
				.maybeSingle();
			if (error) throw new Error(error.message);
			if (!data) return null;
			return { aiVersion: data.ai_version, userVersion: data.user_version };
		},

		async saveEditLearning(userId, learning) {
			const { data, error } = await db()
				.from('user_edit_learnings')
				.upsert({
					id: learning.id ?? newId(),
					user_id: userId,
					brand_brain_id: learning.brandBrainId,
					signal_type: learning.signalType,
					observation: learning.observation,
					confidence: learning.confidence,
					status: learning.status,
					occurrence_count: learning.occurrenceCount,
					last_seen_at: nowIso(),
				})
				.select()
				.single();
			if (error || !data) throw new Error(error?.message || 'Failed to save edit learning');
			return {
				id: data.id,
				brandBrainId: data.brand_brain_id,
				signalType: data.signal_type,
				observation: data.observation,
				confidence: data.confidence,
				status: data.status,
				occurrenceCount: data.occurrence_count,
			};
		},

		async listEditLearnings(userId, brandBrainId) {
			const { data, error } = await db()
				.from('user_edit_learnings')
				.select('*')
				.eq('user_id', userId)
				.eq('brand_brain_id', brandBrainId);
			if (error) throw new Error(error.message);
			return (data ?? []).map((row) => ({
				id: row.id,
				brandBrainId: row.brand_brain_id,
				signalType: row.signal_type,
				observation: row.observation,
				confidence: row.confidence,
				status: row.status,
				occurrenceCount: row.occurrence_count,
			}));
		},

		async updateEditLearning(userId, id, patch) {
			const { data, error } = await db()
				.from('user_edit_learnings')
				.update({
					status: patch.status,
					observation: patch.observation,
					confidence: patch.confidence,
				})
				.eq('id', id)
				.eq('user_id', userId)
				.select()
				.maybeSingle();
			if (error) throw new Error(error.message);
			if (!data) return null;
			return {
				id: data.id,
				brandBrainId: data.brand_brain_id,
				signalType: data.signal_type,
				observation: data.observation,
				confidence: data.confidence,
				status: data.status,
				occurrenceCount: data.occurrence_count,
			} satisfies UserEditLearning;
		},

		async savePerformance(userId, snapshot) {
			const { data, error } = await db()
				.from('performance_snapshots')
				.insert({
					user_id: userId,
					brand_brain_id: snapshot.brandBrainId,
					memory_id: snapshot.memoryId ?? null,
					channel: snapshot.channel,
					collected_at: snapshot.collectedAt,
					hours_since_publish: snapshot.hoursSincePublish ?? null,
					impressions: snapshot.impressions ?? null,
					reach: snapshot.reach ?? null,
					clicks: snapshot.clicks ?? null,
					reactions: snapshot.reactions ?? null,
					comments: snapshot.comments ?? null,
					shares: snapshot.shares ?? null,
					saves: snapshot.saves ?? null,
					conversions: snapshot.conversions ?? null,
					follower_growth: snapshot.followerGrowth ?? null,
					dwell_seconds: snapshot.dwellSeconds ?? null,
					engagement_rate: snapshot.engagementRate ?? null,
					click_through_rate: snapshot.clickThroughRate ?? null,
					normalised: snapshot.normalised ?? {},
				})
				.select()
				.single();
			if (error || !data) throw new Error(error?.message || 'Failed to save performance');
			return {
				id: data.id,
				memoryId: data.memory_id,
				channel: data.channel,
				collectedAt: data.collected_at,
				hoursSincePublish: data.hours_since_publish,
				impressions: data.impressions,
				reach: data.reach,
				clicks: data.clicks,
				reactions: data.reactions,
				comments: data.comments,
				shares: data.shares,
				saves: data.saves,
				conversions: data.conversions,
				followerGrowth: data.follower_growth,
				dwellSeconds: data.dwell_seconds,
				engagementRate: data.engagement_rate,
				clickThroughRate: data.click_through_rate,
				normalised: data.normalised ?? {},
				brandBrainId: snapshot.brandBrainId,
			};
		},

		async listPerformance(userId, brandBrainId) {
			const { data, error } = await db()
				.from('performance_snapshots')
				.select('*')
				.eq('user_id', userId)
				.eq('brand_brain_id', brandBrainId)
				.order('collected_at', { ascending: false });
			if (error) throw new Error(error.message);
			return (data ?? []).map((row) => ({
				id: row.id,
				memoryId: row.memory_id,
				channel: row.channel,
				collectedAt: row.collected_at,
				hoursSincePublish: row.hours_since_publish,
				impressions: row.impressions,
				reach: row.reach,
				clicks: row.clicks,
				reactions: row.reactions,
				comments: row.comments,
				shares: row.shares,
				saves: row.saves,
				conversions: row.conversions,
				followerGrowth: row.follower_growth,
				dwellSeconds: row.dwell_seconds,
				engagementRate: row.engagement_rate,
				clickThroughRate: row.click_through_rate,
				normalised: row.normalised ?? {},
				brandBrainId,
			}));
		},

		async saveLearning(userId, learning) {
			const { data, error } = await db()
				.from('content_learnings')
				.upsert({
					id: learning.id ?? newId(),
					user_id: userId,
					brand_brain_id: learning.brandBrainId,
					scope: learning.scope,
					channel: learning.channel ?? null,
					observation: learning.observation,
					metric: learning.metric ?? null,
					objective: learning.objective ?? null,
					supporting_memory_ids: learning.supportingMemoryIds,
					supporting_experiment_ids: learning.supportingExperimentIds,
					confidence: learning.confidence,
					validity_status: learning.validityStatus,
					last_validated_at: learning.lastValidatedAt ?? null,
					expires_at: learning.expiresAt ?? null,
				})
				.select()
				.single();
			if (error || !data) throw new Error(error?.message || 'Failed to save learning');
			return {
				id: data.id,
				brandBrainId: data.brand_brain_id,
				scope: data.scope,
				channel: data.channel,
				observation: data.observation,
				metric: data.metric,
				objective: data.objective,
				supportingMemoryIds: data.supporting_memory_ids ?? [],
				supportingExperimentIds: data.supporting_experiment_ids ?? [],
				confidence: data.confidence,
				validityStatus: data.validity_status,
				createdAt: data.created_at,
				lastValidatedAt: data.last_validated_at,
				expiresAt: data.expires_at,
			} satisfies ContentLearning;
		},

		async listLearnings(userId, brandBrainId) {
			const { data, error } = await db()
				.from('content_learnings')
				.select('*')
				.eq('user_id', userId)
				.eq('brand_brain_id', brandBrainId);
			if (error) throw new Error(error.message);
			return (data ?? []).map((row) => ({
				id: row.id,
				brandBrainId: row.brand_brain_id,
				scope: row.scope,
				channel: row.channel,
				observation: row.observation,
				metric: row.metric,
				objective: row.objective,
				supportingMemoryIds: row.supporting_memory_ids ?? [],
				supportingExperimentIds: row.supporting_experiment_ids ?? [],
				confidence: row.confidence,
				validityStatus: row.validity_status,
				createdAt: row.created_at,
				lastValidatedAt: row.last_validated_at,
				expiresAt: row.expires_at,
			}));
		},

		async saveExperiment(userId, experiment) {
			const { data, error } = await db()
				.from('content_experiments')
				.upsert({
					id: experiment.id ?? newId(),
					user_id: userId,
					brand_brain_id: experiment.brandBrainId,
					title: experiment.title,
					hypothesis: experiment.hypothesis,
					variable: experiment.variable,
					primary_metric: experiment.primaryMetric,
					secondary_metrics: experiment.secondaryMetrics,
					objective: experiment.objective,
					status: experiment.status,
					minimum_sample: experiment.minimumSample,
					measurement_window_hours: experiment.measurementWindowHours,
					winner_variant_id: experiment.winnerVariantId ?? null,
					confidence: experiment.confidence,
					notes: experiment.notes ?? null,
				})
				.select()
				.single();
			if (error || !data) throw new Error(error?.message || 'Failed to save experiment');
			return (await this.getExperiment(userId, data.id)) as Experiment;
		},

		async addVariant(userId, variant) {
			const { data, error } = await db()
				.from('experiment_variants')
				.upsert({
					id: variant.id ?? newId(),
					user_id: userId,
					experiment_id: variant.experimentId,
					role: variant.role,
					label: variant.label,
					memory_id: variant.memoryId ?? null,
					description: variant.description ?? null,
					controls: variant.controls,
				})
				.select()
				.single();
			if (error || !data) throw new Error(error?.message || 'Failed to add variant');
			return {
				id: data.id,
				experimentId: data.experiment_id,
				role: data.role,
				label: data.label,
				memoryId: data.memory_id,
				description: data.description,
				controls: data.controls ?? {},
			};
		},

		async getExperiment(userId, id) {
			const { data, error } = await db()
				.from('content_experiments')
				.select('*')
				.eq('id', id)
				.eq('user_id', userId)
				.maybeSingle();
			if (error) throw new Error(error.message);
			if (!data) return null;
			const { data: variants } = await db().from('experiment_variants').select('*').eq('experiment_id', id);
			return {
				id: data.id,
				brandBrainId: data.brand_brain_id,
				title: data.title,
				hypothesis: data.hypothesis,
				variable: data.variable,
				primaryMetric: data.primary_metric,
				secondaryMetrics: data.secondary_metrics ?? [],
				objective: data.objective,
				status: data.status,
				minimumSample: data.minimum_sample,
				measurementWindowHours: data.measurement_window_hours,
				winnerVariantId: data.winner_variant_id,
				confidence: data.confidence,
				notes: data.notes,
				variants: (variants ?? []).map((row) => ({
					id: row.id,
					experimentId: row.experiment_id,
					role: row.role,
					label: row.label,
					memoryId: row.memory_id,
					description: row.description,
					controls: row.controls ?? {},
				})),
			};
		},

		async listExperiments(userId, brandBrainId) {
			const { data, error } = await db()
				.from('content_experiments')
				.select('id')
				.eq('user_id', userId)
				.eq('brand_brain_id', brandBrainId);
			if (error) throw new Error(error.message);
			const rows = await Promise.all((data ?? []).map((row) => this.getExperiment(userId, row.id)));
			return rows.filter((row): row is Experiment => Boolean(row));
		},

		async saveExperimentResult(userId, result) {
			const { error } = await db().from('experiment_results').insert({
				user_id: userId,
				experiment_id: result.experimentId,
				variant_id: result.variantId,
				metric: result.metric,
				absolute_value: result.absoluteValue ?? null,
				normalised_value: result.normalisedValue ?? null,
				sample_size: result.sampleSize ?? null,
			});
			if (error) throw new Error(error.message);
		},

		async listExperimentResults(userId, experimentId) {
			const { data, error } = await db()
				.from('experiment_results')
				.select('*')
				.eq('user_id', userId)
				.eq('experiment_id', experimentId);
			if (error) throw new Error(error.message);
			return (data ?? []).map((row) => ({
				variantId: row.variant_id,
				metric: row.metric,
				absoluteValue: row.absolute_value,
				normalisedValue: row.normalised_value,
				sampleSize: row.sample_size,
			}));
		},

		async updateExperiment(userId, id, patch) {
			const { error } = await db()
				.from('content_experiments')
				.update({
					status: patch.status,
					winner_variant_id: patch.winnerVariantId,
					confidence: patch.confidence,
					notes: patch.notes,
				})
				.eq('id', id)
				.eq('user_id', userId);
			if (error) throw new Error(error.message);
			return this.getExperiment(userId, id);
		},

		async enqueueJob(userId, job) {
			const { data, error } = await db()
				.from('workflow_jobs')
				.insert({
					user_id: userId,
					brand_brain_id: job.brandBrainId ?? null,
					job_type: job.jobType,
					status: job.status,
					payload: job.payload,
					reference_id: job.referenceId ?? null,
					retry_count: job.retryCount ?? 0,
					max_retries: job.maxRetries,
				})
				.select()
				.single();
			if (error || !data) throw new Error(error?.message || 'Failed to enqueue job');
			return mapJob(data);
		},

		async claimNextJob() {
			const { data, error } = await db()
				.from('workflow_jobs')
				.select('*')
				.in('status', ['queued', 'retrying'])
				.order('created_at', { ascending: true })
				.limit(1)
				.maybeSingle();
			if (error) throw new Error(error.message);
			if (!data) return null;
			const { data: claimed, error: updateError } = await db()
				.from('workflow_jobs')
				.update({ status: 'processing', started_at: nowIso() })
				.eq('id', data.id)
				.in('status', ['queued', 'retrying'])
				.select()
				.maybeSingle();
			if (updateError) throw new Error(updateError.message);
			return claimed ? mapJob(claimed) : null;
		},

		async updateJob(id, patch) {
			const { data, error } = await db()
				.from('workflow_jobs')
				.update({
					status: patch.status,
					payload: patch.payload,
					retry_count: patch.retryCount,
					last_error: patch.lastError ?? null,
					started_at: patch.startedAt,
					completed_at: patch.completedAt,
				})
				.eq('id', id)
				.select()
				.maybeSingle();
			if (error) throw new Error(error.message);
			return data ? mapJob(data) : null;
		},

		async listJobs(userId, brandBrainId) {
			let query = db().from('workflow_jobs').select('*').eq('user_id', userId).order('created_at', { ascending: false });
			if (brandBrainId) query = query.eq('brand_brain_id', brandBrainId);
			const { data, error } = await query;
			if (error) throw new Error(error.message);
			return (data ?? []).map(mapJob);
		},
	};
}
