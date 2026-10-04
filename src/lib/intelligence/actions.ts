import { z } from 'zod';
import { destinationForChannel, publishArticle } from '@/lib/publishing';
import { analyseExperiment, metricForObjective, PRAGMATIC_CONTROLS } from './experiments';
import { enqueueWorkflowJob } from './jobs';
import { publishStoredMemory } from './publishMemory';
import { recordUserEdit, runContentIntelligencePipeline, type IntelligenceAi } from './pipeline';
import { createSupabaseIntelligenceStore } from './supabaseStore';
import { buildThemePlan, themePlanToIdeas } from './themes';
import { executeThemePlan } from './themeExecution';
import { seedFolianBrand } from './folian/seed';
import { validateBrandBrain, validateFolianBrand } from './folian/validate';
import { computeBaseline, compareToBaseline } from './baselines';
import { snapshotFromManualMetrics } from './ingestion/metrics';
import { attachExperimentVariant, collectExperimentResults } from './experimentOps';
import type { IntelligenceStore } from './store';
import type { OptimizationObjective } from './types';
import { deriveRates } from './performance';
import { isNativeIntelligenceEnabledForBrand } from '@/lib/featureFlags';

export const INTELLIGENCE_ACTION_NAMES = [
	'get_brand',
	'get_strategy',
	'get_theme',
	'list_themes',
	'create_theme',
	'generate_theme_plan',
	'generate_ideas',
	'create_brief',
	'draft_content',
	'revise_content',
	'list_pending_content',
	'approve_content',
	'reject_content',
	'schedule_content',
	'publish_content',
	'publish_article',
	'get_performance',
	'get_experiments',
	'create_experiment',
	'analyse_experiment',
	'validate_brand',
	'seed_folian_brain',
	'execute_theme_plan',
	'compare_performance',
	'ingest_performance',
	'sync_linkedin_analytics',
	'attach_experiment_variant',
	'collect_experiment_results',
] as const;

export type IntelligenceActionName = (typeof INTELLIGENCE_ACTION_NAMES)[number];

const airtableBrandId = z.string().min(1);
const themeInput = z.object({
	airtableBrandId,
	title: z.string().min(1),
	description: z.string().optional(),
	objective: z.string().optional(),
	targetAudience: z.string().optional(),
	relatedPillars: z.array(z.string()).optional(),
	keyArguments: z.array(z.string()).optional(),
	subtopics: z.array(z.string()).optional(),
	questionsToAnswer: z.array(z.string()).optional(),
	proofPoints: z.array(z.string()).optional(),
	keywords: z.array(z.string()).optional(),
	channels: z.array(z.string()).optional(),
	desiredFrequency: z.string().optional(),
});

let storeOverride: IntelligenceStore | undefined;
let aiOverride: IntelligenceAi | undefined;

export function setIntelligenceStoreForTests(store?: IntelligenceStore): void {
	storeOverride = store;
}

export function setIntelligenceAiForTests(ai?: IntelligenceAi): void {
	aiOverride = ai;
}

export function getIntelligenceStore(): IntelligenceStore {
	return storeOverride ?? createSupabaseIntelligenceStore();
}

async function requireBrain(store: IntelligenceStore, userId: string, brandId: string) {
	const brain = await store.getBrandBrain(userId, brandId);
	if (!brain) throw new Error('Brand brain not found');
	return brain;
}

async function assertNativeIntelligence(store: IntelligenceStore, userId: string, compatibilityBrandId: string) {
	const brain = await store.getBrandBrain(userId, compatibilityBrandId);
	if (brain && isNativeIntelligenceEnabledForBrand(brain.id)) return;
	const error = new Error('Native intelligence is not enabled for this brand. Make generation is unchanged.');
	(error as Error & { status: number; code: string }).status = 403;
	(error as Error & { code: string }).code = 'native_intelligence_brand_not_enabled';
	throw error;
}

export async function dispatchIntelligenceAction(
	userId: string,
	action: IntelligenceActionName,
	input: Record<string, unknown>,
): Promise<unknown> {
	const store = getIntelligenceStore();

	switch (action) {
		case 'get_brand': {
			const { airtableBrandId: id } = z.object({ airtableBrandId }).parse(input);
			return requireBrain(store, userId, id);
		}
		case 'get_strategy': {
			const { airtableBrandId: id } = z.object({ airtableBrandId }).parse(input);
			const brain = await requireBrain(store, userId, id);
			return store.getStrategyForBrand(userId, brain.id);
		}
		case 'get_theme': {
			const { themeId } = z.object({ themeId: z.string().min(1) }).parse(input);
			return store.getTheme(userId, themeId);
		}
		case 'list_themes': {
			const { airtableBrandId: id } = z.object({ airtableBrandId }).parse(input);
			const brain = await requireBrain(store, userId, id);
			return store.listThemes(userId, brain.id);
		}
		case 'create_theme': {
			const parsed = themeInput.parse(input);
			const brain = await requireBrain(store, userId, parsed.airtableBrandId);
			const strategy = await store.getStrategyForBrand(userId, brain.id);
			return store.createTheme(userId, {
				brandBrainId: brain.id,
				strategyId: strategy?.id,
				title: parsed.title,
				description: parsed.description,
				objective: parsed.objective,
				targetAudience: parsed.targetAudience,
				relatedPillars: parsed.relatedPillars ?? [],
				keyArguments: parsed.keyArguments ?? [],
				subtopics: parsed.subtopics ?? [],
				questionsToAnswer: parsed.questionsToAnswer ?? [],
				proofPoints: parsed.proofPoints ?? [],
				keywords: parsed.keywords ?? [],
				channels: parsed.channels ?? ['linkedin'],
				desiredFrequency: parsed.desiredFrequency,
				status: 'active',
			});
		}
		case 'generate_theme_plan': {
			const { themeId, coreIdea, horizonWeeks } = z
				.object({
					themeId: z.string().min(1),
					coreIdea: z.string().min(1),
					horizonWeeks: z.number().int().positive().optional(),
				})
				.parse(input);
			const theme = await store.getTheme(userId, themeId);
			if (!theme) throw new Error('Theme not found');
			const plan = buildThemePlan(theme, coreIdea, horizonWeeks ?? 6);
			return store.saveThemePlan(userId, plan);
		}
		case 'generate_ideas': {
			const { themeId } = z.object({ themeId: z.string().min(1) }).parse(input);
			const plan = await store.getLatestThemePlan(userId, themeId);
			if (!plan) throw new Error('Generate a theme plan first');
			return { planId: plan.id, ideas: themePlanToIdeas(plan) };
		}
		case 'create_brief':
		case 'draft_content': {
			const parsed = z
				.object({
					airtableBrandId,
					userIntent: z.string().min(1),
					channel: z.string().min(1),
					contentType: z.string().optional(),
					themeId: z.string().optional(),
					campaignId: z.string().optional(),
					optimizationObjective: z.string().optional(),
					allowThemeContinuation: z.boolean().optional(),
				})
				.parse(input);
			await assertNativeIntelligence(store, userId, parsed.airtableBrandId);
			if (action === 'create_brief') {
				const result = await runContentIntelligencePipeline(
					store,
					{
						userId,
						airtableBrandId: parsed.airtableBrandId,
						userIntent: parsed.userIntent,
						channel: parsed.channel,
						contentType: parsed.contentType as never,
						themeId: parsed.themeId,
						campaignId: parsed.campaignId,
						optimizationObjective: parsed.optimizationObjective as OptimizationObjective | undefined,
						allowThemeContinuation: parsed.allowThemeContinuation,
					},
					aiOverride,
				);
				return { brief: result.brief, memoryId: result.memory.id };
			}
			return runContentIntelligencePipeline(
				store,
				{
					userId,
					airtableBrandId: parsed.airtableBrandId,
					userIntent: parsed.userIntent,
					channel: parsed.channel,
					contentType: parsed.contentType as never,
					themeId: parsed.themeId,
					campaignId: parsed.campaignId,
					optimizationObjective: parsed.optimizationObjective as OptimizationObjective | undefined,
					allowThemeContinuation: parsed.allowThemeContinuation,
				},
				aiOverride,
			);
		}
		case 'revise_content': {
			const parsed = z
				.object({
					draftId: z.string().min(1),
					userVersion: z.string().min(1),
					airtableBrandId,
				})
				.parse(input);
			const brain = await requireBrain(store, userId, parsed.airtableBrandId);
			await recordUserEdit(store, userId, parsed.draftId, parsed.userVersion, brain.id);
			return { ok: true };
		}
		case 'list_pending_content': {
			const { airtableBrandId: id } = z.object({ airtableBrandId }).parse(input);
			const brain = await requireBrain(store, userId, id);
			const rows = await store.listMemory(userId, brain.id);
			return rows.filter((row) => ['draft', 'review', 'idea'].includes(String(row.publicationStatus)));
		}
		case 'approve_content':
		case 'reject_content':
		case 'schedule_content': {
			const parsed = z
				.object({
					memoryId: z.string().min(1),
					publicationDate: z.string().optional(),
				})
				.parse(input);
			const current = await store.getMemory(userId, parsed.memoryId);
			if (!current) throw new Error('Content memory not found');
			const status = action === 'approve_content' ? 'approved' : action === 'reject_content' ? 'review' : 'scheduled';
			return store.saveMemory(userId, {
				...current,
				publicationStatus: status,
				publicationDate: parsed.publicationDate ?? current.publicationDate,
			});
		}
		case 'publish_content': {
			const parsed = z
				.object({
					memoryId: z.string().min(1),
					immediate: z.boolean().optional(),
				})
				.parse(input);
			const current = await store.getMemory(userId, parsed.memoryId);
			if (!current) throw new Error('Content memory not found');
			if (parsed.immediate) {
				return publishStoredMemory(store, userId, current);
			}
			await enqueueWorkflowJob(store, userId, {
				jobType: 'publishing',
				brandBrainId: current.brandBrainId,
				referenceId: current.id,
				payload: {
					memoryId: current.id,
					airtableContentId: current.airtableContentId,
					note: 'Native LinkedIn/article publish via workflow_jobs. Airtable cron publishers remain the live CMS path.',
				},
			});
			return store.saveMemory(userId, { ...current, publicationStatus: 'scheduled' });
		}
		case 'publish_article': {
			const parsed = z
				.object({
					destination: z.string().min(1).optional(),
					memoryId: z.string().optional(),
					airtableBrandId: z.string().optional(),
					title: z.string().optional(),
					body: z.string().optional(),
					webhookUrl: z.string().optional(),
				})
				.parse(input);
			if (parsed.memoryId) {
				const current = await store.getMemory(userId, parsed.memoryId);
				if (!current) throw new Error('Content memory not found');
				const destination = parsed.destination || destinationForChannel(String(current.channel), current.contentType);
				if (parsed.destination && parsed.destination !== destination) {
					const result = await publishArticle({
						destination: parsed.destination,
						userId,
						airtableBrandId: parsed.airtableBrandId,
						memoryId: current.id,
						idempotencyKey: current.id,
						document: {
							title: parsed.title ?? current.hook,
							body: parsed.body ?? current.body ?? '',
							metadata: {
								...current.metadata,
								...(parsed.webhookUrl ? { webhookUrl: parsed.webhookUrl } : {}),
							},
						},
					});
					if (!result.ok) throw new Error(result.error || 'Publish failed');
					const memory = await store.saveMemory(userId, {
						...current,
						publicationStatus: 'published',
						publicationDate: new Date().toISOString(),
						destination: result.url || parsed.destination,
						externalPostId: result.externalId,
						externalUrl: result.url,
					});
					return { ...result, memory };
				}
				return publishStoredMemory(store, userId, current);
			}
			if (!parsed.body) throw new Error('body or memoryId is required');
			const destination = parsed.destination || 'webhook';
			return publishArticle({
				destination,
				userId,
				airtableBrandId: parsed.airtableBrandId,
				idempotencyKey: `${userId}:${destination}:${parsed.title ?? 'article'}`,
				document: {
					title: parsed.title,
					body: parsed.body,
					metadata: parsed.webhookUrl ? { webhookUrl: parsed.webhookUrl } : undefined,
				},
			});
		}
		case 'get_performance': {
			const { airtableBrandId: id } = z.object({ airtableBrandId }).parse(input);
			const brain = await requireBrain(store, userId, id);
			const snapshots = await store.listPerformance(userId, brain.id);
			return snapshots.map((snapshot) => ({ ...snapshot, rates: deriveRates(snapshot) }));
		}
		case 'get_experiments': {
			const { airtableBrandId: id } = z.object({ airtableBrandId }).parse(input);
			const brain = await requireBrain(store, userId, id);
			return store.listExperiments(userId, brain.id);
		}
		case 'create_experiment': {
			const parsed = z
				.object({
					airtableBrandId,
					title: z.string().min(1),
					hypothesis: z.string().min(1),
					variable: z.string().min(1),
					objective: z.string().min(1),
					primaryMetric: z.string().optional(),
					minimumSample: z.number().optional(),
				})
				.parse(input);
			const brain = await requireBrain(store, userId, parsed.airtableBrandId);
			const metrics = metricForObjective(parsed.objective);
			const experiment = await store.saveExperiment(userId, {
				brandBrainId: brain.id,
				title: parsed.title,
				hypothesis: parsed.hypothesis,
				variable: parsed.variable,
				primaryMetric: parsed.primaryMetric ?? metrics.primary,
				secondaryMetrics: metrics.secondary,
				objective: parsed.objective,
				status: 'draft',
				minimumSample: parsed.minimumSample ?? 4,
				measurementWindowHours: 72,
				confidence: 'insufficient',
			});
			await store.addVariant(userId, {
				experimentId: experiment.id,
				role: 'control',
				label: 'Control',
				controls: Object.fromEntries(PRAGMATIC_CONTROLS.map((key) => [key, 'required'])),
			});
			await store.addVariant(userId, {
				experimentId: experiment.id,
				role: 'variant',
				label: 'Variant',
				controls: Object.fromEntries(PRAGMATIC_CONTROLS.map((key) => [key, 'required'])),
			});
			return store.getExperiment(userId, experiment.id);
		}
		case 'analyse_experiment': {
			const { experimentId } = z.object({ experimentId: z.string().min(1) }).parse(input);
			const experiment = await store.getExperiment(userId, experimentId);
			if (!experiment) throw new Error('Experiment not found');
			const results = await store.listExperimentResults(userId, experimentId);
			const analysis = analyseExperiment({ experiment, results });
			if (analysis.winnerVariantId) {
				await store.updateExperiment(userId, experiment.id, {
					status: 'completed',
					winnerVariantId: analysis.winnerVariantId,
					confidence: analysis.confidence,
					notes: analysis.reason,
				});
				if (analysis.learning) {
					await store.saveLearning(userId, {
						brandBrainId: experiment.brandBrainId,
						scope: 'experiment',
						channel: undefined,
						observation: analysis.learning,
						metric: experiment.primaryMetric,
						objective: experiment.objective,
						supportingMemoryIds: [],
						supportingExperimentIds: [experiment.id],
						confidence: analysis.confidence,
						validityStatus: 'active',
						createdAt: new Date().toISOString(),
						lastValidatedAt: new Date().toISOString(),
					});
				}
			}
			return analysis;
		}
		case 'validate_brand': {
			const { airtableBrandId: id, folian } = z
				.object({ airtableBrandId, folian: z.boolean().optional() })
				.parse(input);
			const brain = await requireBrain(store, userId, id);
			const strategy = await store.getStrategyForBrand(userId, brain.id);
			const treatAsFolian = folian || /folian/i.test(brain.identity.name);
			return treatAsFolian ? validateFolianBrand(brain, strategy) : validateBrandBrain(brain, strategy);
		}
		case 'seed_folian_brain': {
			const { airtableBrandId: id } = z.object({ airtableBrandId: airtableBrandId.optional() }).parse(input);
			return seedFolianBrand(store, userId, id);
		}
		case 'execute_theme_plan': {
			const parsed = z
				.object({
					airtableBrandId,
					themeId: z.string().min(1),
					coreIdea: z.string().min(1),
					horizonWeeks: z.number().int().positive().optional(),
					maxPieces: z.number().int().positive().optional(),
				})
				.parse(input);
			await assertNativeIntelligence(store, userId, parsed.airtableBrandId);
			return executeThemePlan({
				store,
				userId,
				airtableBrandId: parsed.airtableBrandId,
				themeId: parsed.themeId,
				coreIdea: parsed.coreIdea,
				horizonWeeks: parsed.horizonWeeks,
				maxPieces: parsed.maxPieces,
				ai: aiOverride,
			});
		}
		case 'compare_performance': {
			const parsed = z
				.object({
					airtableBrandId,
					memoryId: z.string().min(1),
					objective: z.string().optional(),
					channel: z.string().optional(),
					contentType: z.string().optional(),
				})
				.parse(input);
			const brain = await requireBrain(store, userId, parsed.airtableBrandId);
			const memory = await store.getMemory(userId, parsed.memoryId);
			if (!memory) throw new Error('Content memory not found');
			const snapshots = await store.listPerformance(userId, brain.id);
			const objective = (parsed.objective || 'authority') as OptimizationObjective;
			const channel = parsed.channel || String(memory.channel);
			const baseline = computeBaseline({
				snapshots,
				memory: await store.listMemory(userId, brain.id),
				channel,
				contentType: parsed.contentType || memory.contentType,
				objective,
			});
			const latest = snapshots.find((row) => row.memoryId === memory.id);
			if (!latest) {
				return { baseline, comparison: { relative: 'unknown', confidence: 'insufficient', summary: 'No snapshot for this item yet.' } };
			}
			return { baseline, comparison: compareToBaseline({ snapshot: latest, baseline, objective }) };
		}
		case 'ingest_performance': {
			const parsed = z
				.object({
					airtableBrandId,
					memoryId: z.string().optional(),
					channel: z.string().min(1),
					hoursSincePublish: z.number().optional(),
					impressions: z.number().optional(),
					reach: z.number().optional(),
					clicks: z.number().optional(),
					reactions: z.number().optional(),
					comments: z.number().optional(),
					shares: z.number().optional(),
					saves: z.number().optional(),
					conversions: z.number().optional(),
				})
				.parse(input);
			const brain = await requireBrain(store, userId, parsed.airtableBrandId);
			return store.savePerformance(userId, {
				...snapshotFromManualMetrics(parsed),
				brandBrainId: brain.id,
			});
		}
		case 'sync_linkedin_analytics': {
			const parsed = z
				.object({
					airtableBrandId,
					memoryId: z.string().optional(),
				})
				.parse(input);
			await requireBrain(store, userId, parsed.airtableBrandId);
			const { ingestBrandLinkedInAnalytics } = await import('./ingestion/linkedin');
			return ingestBrandLinkedInAnalytics(store, userId, parsed.airtableBrandId, parsed.memoryId);
		}
		case 'attach_experiment_variant': {
			const parsed = z
				.object({
					experimentId: z.string().min(1),
					variantId: z.string().min(1),
					memoryId: z.string().min(1),
				})
				.parse(input);
			return attachExperimentVariant(store, userId, parsed);
		}
		case 'collect_experiment_results': {
			const { experimentId } = z.object({ experimentId: z.string().min(1) }).parse(input);
			return collectExperimentResults(store, userId, experimentId);
		}
		default:
			throw new Error(`Unsupported action ${action}`);
	}
}
