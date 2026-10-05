import { nativeIntelligenceBlock } from '@/lib/featureFlags';
import { resolveModelForRole, MODEL_ROLES } from '@/lib/ai/roles';
import { computeBaseline } from '@/lib/intelligence/baselines';
import { getIntelligenceAi, getIntelligenceStore } from '@/lib/intelligence/actions';
import { snapshotFromManualMetrics } from '@/lib/intelligence/ingestion/metrics';
import { analyseExperiment } from '@/lib/intelligence/experiments';
import { runContentIntelligencePipeline } from '@/lib/intelligence/pipeline';
import { completeReview } from '@/lib/intelligence/review';
import { validateBrandBrain, validateFolianBrand } from '@/lib/intelligence/folian/validate';
import type { BrandBrain, BrandStrategy, ContentBrief, ContentMemoryRecord, ContentTheme, GenerationResult } from '@/lib/intelligence/types';
import { channelCatalog, resolveChannel } from './channels';
import { getAgentStore } from './controlStore';
import { AgentError } from './errors';
import { CAPABILITY_GROUP } from './policy';
import { dispatchContentExtensions } from './extensions';
import { assertScheduleMatchesApproval, createApprovalRequest } from './approvals';
import { planMedia } from '@/lib/media/planner';
import { getNativeContentStore } from '@/lib/media/store';
import { publicAsset } from '@/lib/media/images';
import { decideResearch } from '@/lib/research/policy';
import { selectRelevantResearch } from '@/lib/research/retrieve';
import { packetContext } from '@/lib/research/run';
import { createMonitor, executeResearch, monitorProject } from '@/lib/research/service';
import { selectSearchProvider } from '@/lib/research/search';
import { MONITOR_TYPES, type ResearchProjectType } from '@/lib/research/types';
import type { AgentCredential, MarketingOpportunity } from './types';

export type AgentContext = {
	credential: AgentCredential;
	requestId: string;
};

const INSUFFICIENT = 'Insufficient history for performance-informed optimisation.';

function inputString(input: Record<string, unknown>, key: string): string | undefined {
	const value = input[key];
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function inputStrings(input: Record<string, unknown>, key: string): string[] | undefined {
	const value = input[key];
	if (!Array.isArray(value)) return undefined;
	return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

async function requireBrand(ctx: AgentContext, brandId?: string): Promise<BrandBrain> {
	const allowed = ctx.credential.allowedBrandIds;
	const id = brandId ?? (allowed.length === 1 ? allowed[0] : undefined);
	if (!id || !allowed.includes(id)) {
		throw new AgentError('brand_not_accessible', 'This agent cannot access that brand.', 403);
	}
	const brain = await getIntelligenceStore().getBrandBrainById(ctx.credential.ownerUserId, id);
	if (!brain) throw new AgentError('brand_not_accessible', 'This agent cannot access that brand.', 403);
	return brain;
}

async function requireContent(ctx: AgentContext, contentId: string): Promise<ContentMemoryRecord> {
	const memory = await getIntelligenceStore().getMemory(ctx.credential.ownerUserId, contentId);
	if (!memory || !ctx.credential.allowedBrandIds.includes(memory.brandBrainId)) {
		throw new AgentError('brand_not_accessible', 'This agent cannot access that content.', 403);
	}
	return memory;
}

function assertHttpsUrl(url: string): void {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new AgentError('invalid_url', 'URL must be an https URL.', 400);
	}
	if (parsed.protocol !== 'https:') throw new AgentError('invalid_url', 'URL must use https.', 400);
	const host = parsed.hostname.toLowerCase();
	if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '::1') {
		throw new AgentError('invalid_url', 'URL host is not allowed.', 400);
	}
	if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
		const [a, b] = host.split('.').map(Number);
		const blocked = a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
		if (blocked) throw new AgentError('invalid_url', 'URL host is not allowed.', 400);
	}
}

function publicContent(memory: ContentMemoryRecord) {
	return {
		id: memory.id,
		brandId: memory.brandBrainId,
		channel: memory.channel,
		contentType: memory.contentType,
		topic: memory.topic,
		hook: memory.hook,
		argument: memory.argument,
		cta: memory.cta,
		body: memory.body,
		status: memory.publicationStatus,
		publicationDate: memory.publicationDate,
		themeId: memory.themeId,
		campaignId: memory.campaignId,
		externalPostId: memory.externalPostId,
		externalUrl: memory.externalUrl,
		createdAt: memory.createdAt,
	};
}

function publicStrategy(strategy: BrandStrategy | null) {
	if (!strategy) return null;
	return {
		id: strategy.id,
		status: strategy.status,
		objectives: strategy.objectives,
		audiences: strategy.audiences,
		positioning: strategy.positioning,
		keyMessages: strategy.keyMessages,
		proofPoints: strategy.proofPoints,
		pillars: strategy.contentPillars,
		ctaStrategy: strategy.ctaStrategy,
		contentMix: strategy.contentMix,
		editorialThemes: strategy.editorialThemes,
		campaigns: strategy.campaigns.map((campaign) => ({
			id: campaign.id,
			title: campaign.title,
			objective: campaign.objective,
			status: campaign.status,
			startDate: campaign.startDate,
			endDate: campaign.endDate,
		})),
		channelStrategies: strategy.channelStrategies.map((channel) => ({
			id: channel.id,
			channel: channel.channel,
			role: channel.role,
			cadence: channel.cadence,
			formats: channel.formats,
			constraints: channel.constraints,
		})),
	};
}

async function emit(ctx: AgentContext, brandId: string, type: string, payload: Record<string, unknown>) {
	await getAgentStore().saveEvent(ctx.credential.ownerUserId, {
		id: crypto.randomUUID(),
		brandId,
		type,
		payload,
		createdAt: new Date().toISOString(),
	});
}

async function brandContext(ctx: AgentContext, brandId?: string) {
	const brain = await requireBrand(ctx, brandId);
	const store = getIntelligenceStore();
	const [strategy, themes, memory] = await Promise.all([
		store.getStrategyForBrand(ctx.credential.ownerUserId, brain.id),
		store.listThemes(ctx.credential.ownerUserId, brain.id),
		store.listMemory(ctx.credential.ownerUserId, brain.id),
	]);
	return { brain, strategy, themes, memory };
}

function tokens(text: string): string[] {
	const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'about', 'into', 'have', 'been', 'what', 'when']);
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length > 3 && !stop.has(word));
}

function evaluateOpportunity(opportunity: MarketingOpportunity, strategy: BrandStrategy | null, themes: ContentTheme[], memory: ContentMemoryRecord[]) {
	const opportunityTokens = tokens([opportunity.topic, opportunity.summary, opportunity.whyRelevant ?? ''].join(' '));
	const strategyText = [
		strategy?.positioning ?? '',
		...(strategy?.contentPillars ?? []),
		...(strategy?.keyMessages ?? []),
		...themes.map((theme) => `${theme.title} ${theme.description ?? ''}`),
	].join(' ');
	const strategyTokens = new Set(tokens(strategyText));
	const overlap = opportunityTokens.filter((word) => strategyTokens.has(word));
	const brandRelevance = opportunityTokens.length === 0 ? 0 : overlap.length / opportunityTokens.length;
	const recent = memory.filter((item) => tokens(`${item.topic ?? ''} ${item.hook ?? ''}`).some((word) => opportunityTokens.includes(word)));
	const repetitionRisk = recent.length >= 3 ? 'high' : recent.length >= 1 ? 'moderate' : 'low';
	let action: 'draft' | 'wait' | 'ignore' | 'needs_strategy' = 'draft';
	if (!strategy) action = 'needs_strategy';
	else if (brandRelevance < 0.2) action = 'ignore';
	else if (repetitionRisk === 'high') action = 'wait';
	const matchedTheme = themes.find((theme) => tokens(theme.title).some((word) => opportunityTokens.includes(word)));
	return {
		brandRelevance: Math.round(brandRelevance * 100) / 100,
		audienceRelevance: opportunity.audience ? 'stated_by_discoverer' : 'not_stated',
		strategicFit: action === 'ignore' || action === 'needs_strategy' ? 'weak' : 'fit',
		freshness: 'source_time_not_independently_verified',
		repetitionRisk,
		recommendedChannel: opportunity.suggestedChannel ?? matchedTheme?.channels[0] ?? 'LINKEDIN_PERSONAL',
		recommendedContentType: opportunity.suggestedChannel === 'BLOG' ? 'article' : 'founder_post',
		action,
		matchedThemeId: matchedTheme?.id,
		note: 'CCE compared the submission with stored strategy and themes. The discoverer summary is evidence, not a Brand Brain fact.',
	};
}

function assertNative(brain: BrandBrain): void {
	const block = nativeIntelligenceBlock({ nativeIntelligenceEnabled: brain.guardrails.nativeIntelligenceEnabled });
	if (block === 'native_intelligence_globally_disabled') {
		throw new AgentError(block, 'Native intelligence is turned off for every brand.', 403);
	}
	if (block === 'native_intelligence_brand_disabled') {
		throw new AgentError(block, 'Native intelligence is turned off for this brand.', 403);
	}
}

async function assertBudget(ctx: AgentContext): Promise<void> {
	const cap = ctx.credential.rateLimit.dailyCostUsd;
	if (cap == null) return;
	const spent = await getAgentStore().costToday(ctx.credential.id);
	if (spent >= cap) throw new AgentError('ai_billing', 'Daily agent generation budget is exhausted.', 402);
}

function generationPayload(result: GenerationResult, started: number) {
	const writing = result.usage.find((row) => row.role === 'WRITING') ?? result.usage.at(-1);
	return {
		contentId: result.memory.id,
		draftId: result.draftId,
		brandId: result.memory.brandBrainId,
		channel: result.memory.channel,
		topic: result.memory.topic,
		body: result.reviewedDraft,
		status: result.memory.publicationStatus,
		reviewPassed: result.review.materialPassed,
		contextGaps: result.contextGaps,
		modelRole: result.modelRole,
		model: writing?.model ?? null,
		estimatedCostUsd: result.estimatedCostUsd,
		processingMs: Date.now() - started,
	};
}

function contentTypeFor(channel: string): string {
	if (channel === 'blog') return 'article';
	if (channel === 'x' || channel === 'threads') return 'thread';
	if (channel === 'newsletter') return 'newsletter';
	return 'founder_post';
}

function configuredSearch() {
	const provider = selectSearchProvider();
	if (provider.configured) return provider;
	return { name: provider.name, configured: false, async search() { return []; } };
}

function publicResearch(record: { id: string; brandId: string; request: string; createdAt: string; packet?: { projectType: string; decision: string; gaps: string[]; usage: unknown; promotedToBrandBrain: false }; sources: unknown[]; claims: unknown[] }) {
	return {
		researchId: record.id,
		brandId: record.brandId,
		request: record.request,
		createdAt: record.createdAt,
		projectType: record.packet?.projectType ?? null,
		decision: record.packet?.decision ?? null,
		sourceCount: record.packet ? record.sources.length : record.sources.length,
		claimCount: record.claims.length,
		gaps: record.packet?.gaps ?? [],
		usage: record.packet?.usage ?? null,
		promotedToBrandBrain: false,
	};
}

async function ownedResearch(ctx: AgentContext, brandId: string | undefined, researchId: string | undefined) {
	if (!researchId) throw new AgentError('invalid_input', 'researchId is required.', 400);
	const record = await getAgentStore().getResearch(ctx.credential.ownerUserId, researchId);
	if (!record || !ctx.credential.allowedBrandIds.includes(record.brandId) || (brandId && record.brandId !== brandId)) {
		throw new AgentError('brand_not_accessible', 'This agent cannot access that research.', 403);
	}
	return record;
}

async function researchForInstruction(ctx: AgentContext, brain: BrandBrain, instruction: string, attachedIds: string[] = []) {
	const existing = await getAgentStore().listResearch(ctx.credential.ownerUserId, brain.id);
	const relevant = selectRelevantResearch(existing, instruction, attachedIds);
	const latest = relevant[0];
	const decision = decideResearch({
		instruction,
		hasFreshResearch: relevant.length > 0,
		existingVerifiedAt: latest?.packet?.sources.find((source) => source.verifiedAt)?.verifiedAt ?? latest?.createdAt,
	});
	if (relevant.length > 0 && (decision.decision === 'NO_RESEARCH_NEEDED' || decision.decision === 'USE_EXISTING_RESEARCH')) {
		return {
			decision: 'USE_EXISTING_RESEARCH' as const,
			researchId: latest?.id,
			context: relevant.map((record) => (record.packet ? packetContext(record.packet) : record.claims.map((claim) => claim.text).join('\n'))).join('\n\n'),
		};
	}
	if (decision.decision === 'NO_RESEARCH_NEEDED') {
		return { decision: decision.decision, researchId: undefined, context: 'No fresh external research was required.' };
	}
	const record = await executeResearch({
		ownerUserId: ctx.credential.ownerUserId,
		brandId: brain.id,
		brandName: brain.identity.name,
		query: instruction.slice(0, 300),
		projectType: 'CURRENT_RESEARCH',
		brandFacts: brain.knowledge.brandFacts,
		search: configuredSearch(),
		researchDecision: decision.decision,
	});
	const context = [record.packet ? packetContext(record.packet) : '', ...relevant.map((item) => item.packet ? packetContext(item.packet) : item.request)].filter(Boolean).join('\n\n');
	return { decision: decision.decision, researchId: record.id, context };
}

async function generateForChannel(ctx: AgentContext, brain: BrandBrain, input: { instruction: string; channel: string; themeId?: string; objective?: string; researchIds?: string[] }) {
	const channel = resolveChannel(input.channel);
	const pipelineChannel = channel?.pipelineChannel ?? input.channel.toLowerCase();
	const adaptation = channel?.adaptation ?? 'Write for this channel on its own. Do not reuse another channel’s wording.';
	const started = Date.now();
	const research = await researchForInstruction(ctx, brain, input.instruction, input.researchIds ?? []);
	const result = await runContentIntelligencePipeline(
		getIntelligenceStore(),
		{
			userId: ctx.credential.ownerUserId,
			airtableBrandId: brain.airtableBrandId,
			userIntent: `${input.instruction}\n\n${research.context}\n\nChannel adaptation: ${adaptation}`,
			channel: pipelineChannel,
			contentType: contentTypeFor(pipelineChannel) as never,
			themeId: input.themeId,
			optimizationObjective: 'authority',
		},
		getIntelligenceAi(),
	);
	if (typeof result.estimatedCostUsd === 'number') {
		await getAgentStore().addCost(ctx.credential.id, result.estimatedCostUsd);
	}
	await emit(ctx, brain.id, 'content.created', { contentId: result.memory.id, channel: pipelineChannel });
	return { ...generationPayload(result, started), researchId: research.researchId, researchDecision: research.decision };
}

function calendarItems(memory: ContentMemoryRecord[], input: Record<string, unknown>) {
	const start = inputString(input, 'start');
	const end = inputString(input, 'end');
	const status = inputString(input, 'status');
	const channels = inputStrings(input, 'channels')?.map((channel) => resolveChannel(channel)?.pipelineChannel ?? channel.toLowerCase());
	const campaignId = inputString(input, 'campaignId');
	const themeId = inputString(input, 'themeId');
	return memory.filter((item) => {
		const when = item.publicationDate ?? item.createdAt;
		if (start && when < start) return false;
		if (end && when > end) return false;
		if (status && item.publicationStatus !== status) return false;
		if (channels && !channels.includes(String(item.channel))) return false;
		if (campaignId && item.campaignId !== campaignId) return false;
		if (themeId && item.themeId !== themeId) return false;
		return true;
	});
}

function gapReport(memory: ContentMemoryRecord[], themes: ContentTheme[]) {
	const scheduledChannels = new Set(memory.filter((item) => item.publicationStatus === 'scheduled').map((item) => item.channel));
	const gaps: string[] = [];
	for (const channel of ['linkedin', 'x', 'threads']) {
		if (!scheduledChannels.has(channel)) gaps.push(`No ${channel} post is scheduled.`);
	}
	const themeGaps = themes.map((theme) => {
		const uses = memory.filter((item) => item.themeId === theme.id);
		const latest = uses.map((item) => item.createdAt).sort().at(-1);
		const ageDays = latest ? Math.floor((Date.now() - Date.parse(latest)) / 86_400_000) : null;
		return { themeId: theme.id, title: theme.title, uses: uses.length, daysSinceLastUse: ageDays };
	});
	for (const theme of themeGaps) {
		if (theme.uses === 0) gaps.push(`${theme.title} has not been used.`);
		else if (theme.daysSinceLastUse != null && theme.daysSinceLastUse > 14) gaps.push(`${theme.title} has not been used in ${theme.daysSinceLastUse} days.`);
	}
	const counts = themeGaps.filter((theme) => theme.uses > 0).sort((a, b) => b.uses - a.uses);
	if (counts.length >= 2 && counts[0].uses >= counts[counts.length - 1].uses + 3) {
		gaps.push(`${counts[0].title} has been used ${counts[0].uses} times while ${counts[counts.length - 1].title} has been used ${counts[counts.length - 1].uses} times.`);
	}
	return { gaps, themeUsage: themeGaps };
}

function performanceSummary(snapshots: Array<{ channel: string; collectedAt: string; impressions?: number; clicks?: number; engagementRate?: number }>) {
	if (snapshots.length === 0) {
		return { history: 'insufficient' as const, note: INSUFFICIENT, sampleSize: 0, snapshots: [] as typeof snapshots };
	}
	return { history: snapshots.length < 8 ? ('limited' as const) : ('available' as const), note: snapshots.length < 8 ? INSUFFICIENT : 'Observational only. Not a forecast.', sampleSize: snapshots.length, snapshots };
}

async function proposalResponse(ctx: AgentContext, brandId: string, summary: string, proposedState: string, extra: Record<string, unknown>) {
	const approvalId = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
	await emit(ctx, brandId, 'ad.proposal_created', { approvalId, summary });
	return {
		status: 'approval_required' as const,
		approvalId,
		action: 'financial_change',
		summary,
		currentState: extra.currentState ?? 'unchanged',
		proposedState,
		consequence: 4,
		expiresAt,
		executed: false,
	};
}

async function getMarketingBrief(ctx: AgentContext, input: Record<string, unknown>) {
	const { brain, strategy, themes, memory } = await brandContext(ctx, inputString(input, 'brandId'));
	const snapshots = await getIntelligenceStore().listPerformance(ctx.credential.ownerUserId, brain.id);
	const opportunities = await getAgentStore().listOpportunities(ctx.credential.ownerUserId, brain.id);
	const experiments = await getIntelligenceStore().listExperiments(ctx.credential.ownerUserId, brain.id);
	const inbox = await getAgentStore().listInteractions(ctx.credential.ownerUserId, brain.id);
	const gaps = gapReport(memory, themes);
	const awaiting = memory.filter((item) => item.publicationStatus === 'review').map(publicContent);
	const scheduled = memory.filter((item) => item.publicationStatus === 'scheduled').map(publicContent);
	const failed = memory.filter((item) => item.publicationStatus === 'failed').map(publicContent);
	const performance = performanceSummary(snapshots);
	return {
		brandId: brain.id,
		brand: brain.identity.name,
		objective: strategy?.objectives[0] ?? null,
		positioning: strategy?.positioning ?? brain.identity.positioning,
		themes: themes.map((theme) => ({ id: theme.id, title: theme.title, status: theme.status })),
		scheduled,
		awaitingApproval: awaiting,
		failed,
		gaps: gaps.gaps,
		performance,
		opportunities: opportunities.filter((item) => item.status === 'new' || item.status === 'evaluated'),
		experiments: experiments.map((experiment) => ({ id: experiment.id, title: experiment.title, status: experiment.status, confidence: experiment.confidence, winner: experiment.winnerVariantId ?? null })),
		unansweredCommunity: inbox.filter((item) => item.responseStatus === 'open' || item.responseStatus === 'awaiting_approval'),
		paidMedia: { available: false, code: 'analytics_unavailable', note: 'No paid account is connected to this agent.' },
		decisionsRequired: awaiting.map((item) => ({ decision: 'approve_content', contentId: item.id, approver: 'human' })),
	};
}

async function nextBestActions(ctx: AgentContext, input: Record<string, unknown>) {
	const brief = await getMarketingBrief(ctx, input);
	const actions: Array<Record<string, unknown>> = [];
	if (brief.awaitingApproval.length) {
		actions.push({ action: 'Approve content', rationale: `${brief.awaitingApproval.length} item(s) are waiting.`, urgency: 'high', expectedImpact: 'unblocks publishing later', effort: 'low', confidence: 'high', approvalRequirement: 'human' });
	}
	if (brief.failed.length) {
		actions.push({ action: 'Review failed publish', rationale: `${brief.failed.length} publish(es) failed.`, urgency: 'high', expectedImpact: 'restores delivery', effort: 'medium', confidence: 'high', approvalRequirement: 'human' });
	}
	for (const gap of brief.gaps.slice(0, 3)) {
		actions.push({ action: 'Fill calendar gap', rationale: gap, urgency: 'medium', expectedImpact: 'keeps the cadence', effort: 'medium', confidence: 'moderate', approvalRequirement: 'human_before_publish' });
	}
	const openOpportunities = brief.opportunities.filter((item) => item.status === 'new');
	if (openOpportunities.length) {
		actions.push({ action: 'Evaluate opportunities', rationale: `${openOpportunities.length} opportunity record(s) are not yet evaluated.`, urgency: 'medium', expectedImpact: 'may produce a relevant draft', effort: 'low', confidence: 'moderate', approvalRequirement: 'none_for_evaluation' });
	}
	if (brief.performance.history !== 'available') {
		actions.push({ action: 'Wait for performance history', rationale: brief.performance.note, urgency: 'low', expectedImpact: 'avoids a false optimisation', effort: 'none', confidence: 'high', approvalRequirement: 'none' });
	}
	actions.push({ action: 'Do not change ad spend', rationale: 'No paid account is connected and budget changes require human approval.', urgency: 'low', expectedImpact: 'avoids unapproved spend', effort: 'none', confidence: 'high', approvalRequirement: 'human_for_any_spend_change' });
	return { brandId: brief.brandId, actions };
}

export async function dispatchAgentHandler(name: string, ctx: AgentContext, input: Record<string, unknown>): Promise<unknown> {
	const brandId = inputString(input, 'brandId');
	switch (name) {
		case 'cce_list_brands': {
			const brands = [];
			for (const id of ctx.credential.allowedBrandIds) {
				const brain = await getIntelligenceStore().getBrandBrainById(ctx.credential.ownerUserId, id);
				if (!brain) continue;
				const strategy = await getIntelligenceStore().getStrategyForBrand(ctx.credential.ownerUserId, brain.id);
				brands.push({
					id: brain.id,
					name: brain.identity.name,
					status: strategy?.status ?? 'active',
					channels: strategy?.channelStrategies.map((channel) => channel.channel) ?? [],
				});
			}
			return { brands };
		}
		case 'cce_get_capabilities': {
			const groups = [...new Set(ctx.credential.capabilities.map((capability) => CAPABILITY_GROUP[capability]))];
			return {
				brands: ctx.credential.allowedBrandIds,
				capabilities: ctx.credential.capabilities,
				groups,
				channels: channelCatalog(),
				consequenceLevels: { 0: 'read', 1: 'internal_write', 2: 'prepare_external', 3: 'external_action', 4: 'financial' },
				note: 'NOT_IMPLEMENTED, DISCONNECTED, NOT_AUTHORIZED, and UNKNOWN are not usable. Do not assume a connection.',
			};
		}
		case 'cce_get_system_status': {
			const store = getIntelligenceStore();
			const jobs = await store.listJobs(ctx.credential.ownerUserId);
			const brands = [];
			for (const id of ctx.credential.allowedBrandIds) {
				const brain = await store.getBrandBrainById(ctx.credential.ownerUserId, id);
				if (!brain) continue;
				const memory = await store.listMemory(ctx.credential.ownerUserId, brain.id);
				const snapshots = await store.listPerformance(ctx.credential.ownerUserId, brain.id);
				brands.push({
					brandId: brain.id,
					pendingApprovals: memory.filter((item) => item.publicationStatus === 'review').length,
					failedPublishes: memory.filter((item) => item.publicationStatus === 'failed').length,
					metrics: snapshots.length === 0 ? 'missing' : 'present',
				});
			}
			return {
				status: 'ok',
				failedJobs: jobs.filter((job) => job.status === 'failed').slice(0, 10).map((job) => ({ id: job.id, type: job.jobType, error: job.lastError ?? null })),
				integrations: channelCatalog().map((channel) => ({ channel: channel.id, publish: channel.capabilities.publish, analytics: channel.capabilities.analytics })),
				brands,
				models: MODEL_ROLES.map((role) => ({ role, model: resolveModelForRole(role) })),
			};
		}
		case 'cce_get_brands': {
			const brands = [];
			for (const id of ctx.credential.allowedBrandIds) {
				const brain = await getIntelligenceStore().getBrandBrainById(ctx.credential.ownerUserId, id);
				if (brain) brands.push({ id: brain.id, name: brain.identity.name });
			}
			return { brands };
		}
		case 'cce_get_brand': {
			const brain = await requireBrand(ctx, brandId);
			const requested = inputStrings(input, 'sections') ?? ['identity', 'positioning', 'voice', 'guardrails'];
			const sections: Record<string, unknown> = {
				identity: { name: brain.identity.name, description: brain.identity.description, purpose: brain.identity.purpose, mission: brain.identity.mission, marketCategory: brain.identity.marketCategory },
				audiences: brain.identity.audiences,
				positioning: brain.identity.positioning,
				voice: brain.voice,
				guardrails: brain.guardrails,
				knowledge: brain.knowledge,
				proof: brain.knowledge.proofPoints ?? [],
				products: brain.identity.productsServices,
				examples: brain.examples.map((example) => ({ kind: example.kind, channel: example.channel, body: example.body, whyItWorks: example.whyItWorks })),
			};
			const selected: Record<string, unknown> = {};
			for (const section of requested) if (section in sections) selected[section] = sections[section];
			return { brandId: brain.id, name: brain.identity.name, sections: selected };
		}
		case 'cce_get_brand_health': {
			const { brain, strategy, themes, memory } = await brandContext(ctx, brandId);
			const validation = /folian/i.test(brain.identity.name) ? validateFolianBrand(brain, strategy) : validateBrandBrain(brain, strategy);
			const snapshots = await getIntelligenceStore().listPerformance(ctx.credential.ownerUserId, brain.id);
			const issues = [...validation.issues];
			if (themes.length === 0) issues.push({ path: 'themes', severity: 'warning' as const, message: 'No active themes' });
			if (snapshots.length === 0) issues.push({ path: 'analytics', severity: 'warning' as const, message: 'No performance snapshots' });
			if (memory.length === 0) issues.push({ path: 'memory', severity: 'warning' as const, message: 'No content memory yet' });
			const disconnected = channelCatalog().filter((channel) => channel.capabilities.publish === 'NOT_IMPLEMENTED' || channel.capabilities.publish === 'UNKNOWN').map((channel) => channel.id);
			return { brandId: brain.id, ok: validation.ok, score: validation.score, issues, disconnectedChannels: disconnected };
		}
		case 'cce_get_strategy': {
			const { brain, strategy, themes } = await brandContext(ctx, brandId);
			return { brandId: brain.id, strategy: publicStrategy(strategy), themes: themes.map((theme) => ({ id: theme.id, title: theme.title, status: theme.status, channels: theme.channels })) };
		}
		case 'cce_get_themes': {
			const { themes } = await brandContext(ctx, brandId);
			return { themes: themes.map((theme) => ({ id: theme.id, title: theme.title, description: theme.description, status: theme.status, channels: theme.channels, objective: theme.objective })) };
		}
		case 'cce_get_campaigns': {
			const { strategy } = await brandContext(ctx, brandId);
			return { campaigns: publicStrategy(strategy)?.campaigns ?? [] };
		}
		case 'cce_create_theme_proposal':
		case 'cce_update_strategy_proposal': {
			const { brain } = await brandContext(ctx, brandId);
			const note = name === 'cce_create_theme_proposal' ? inputString(input, 'rationale') : inputString(input, 'proposedChange');
			const title = inputString(input, 'title') ?? inputString(input, 'summary') ?? 'Strategy proposal';
			const saved = await getAgentStore().saveFeedback(ctx.credential.ownerUserId, {
				id: crypto.randomUUID(),
				brandId: brain.id,
				subjectType: name === 'cce_create_theme_proposal' ? 'theme_proposal' : 'strategy_proposal',
				note: `${title}: ${note ?? ''}`,
				actor: ctx.credential.id,
				createdAt: new Date().toISOString(),
				appliedToBrandBrain: false,
			});
			return { id: saved.id, status: 'proposed', applied: false };
		}
		case 'cce_get_calendar': {
			const { memory } = await brandContext(ctx, brandId);
			const items = calendarItems(memory, input).map(publicContent);
			const byStatus = (status: string) => items.filter((item) => item.status === status);
			return { scheduled: byStatus('scheduled'), drafted: byStatus('draft'), awaitingApproval: byStatus('review'), published: byStatus('published'), failed: byStatus('failed'), planned: byStatus('idea'), items };
		}
		case 'cce_get_calendar_gaps': {
			const { memory, themes } = await brandContext(ctx, brandId);
			return gapReport(memory, themes);
		}
		case 'cce_get_opportunities': {
			const brain = await requireBrand(ctx, brandId);
			return { opportunities: await getAgentStore().listOpportunities(ctx.credential.ownerUserId, brain.id) };
		}
		case 'cce_create_opportunity': {
			const brain = await requireBrand(ctx, brandId);
			const sourceUrl = inputString(input, 'sourceUrl');
			if (sourceUrl) assertHttpsUrl(sourceUrl);
			const evidenceRaw = Array.isArray(input.evidence) ? input.evidence : [];
			const opportunity: MarketingOpportunity = {
				id: crypto.randomUUID(),
				brandId: brain.id,
				source: inputString(input, 'source') ?? 'agent',
				sourcePlatform: inputString(input, 'sourcePlatform'),
				sourceUrl,
				sourceId: inputString(input, 'sourceId'),
				discoveredBy: ctx.credential.name,
				discoveredAt: new Date().toISOString(),
				opportunityType: inputString(input, 'opportunityType') ?? 'CONVERSATION',
				topic: inputString(input, 'topic') ?? '',
				summary: inputString(input, 'summary') ?? '',
				whyRelevant: inputString(input, 'whyRelevant'),
				audience: inputString(input, 'audience'),
				suggestedAction: inputString(input, 'suggestedAction'),
				suggestedChannel: inputString(input, 'suggestedChannel'),
				urgency: inputString(input, 'urgency'),
				confidence: inputString(input, 'confidence'),
				evidence: evidenceRaw.filter((item) => item && typeof item === 'object').map((item) => {
					const row = item as Record<string, unknown>;
					return {
						url: typeof row.url === 'string' ? row.url : undefined,
						excerpt: typeof row.excerpt === 'string' ? row.excerpt.slice(0, 500) : undefined,
						author: typeof row.author === 'string' ? row.author.slice(0, 120) : undefined,
						retrievedAt: typeof row.retrievedAt === 'string' ? row.retrievedAt : undefined,
						platformId: typeof row.platformId === 'string' ? row.platformId : undefined,
					};
				}),
				relatedThemeId: inputString(input, 'relatedThemeId'),
				status: 'new',
				expiresAt: inputString(input, 'expiresAt'),
				summaryByDiscoverer: inputString(input, 'summary'),
			};
			await getAgentStore().saveOpportunity(ctx.credential.ownerUserId, opportunity);
			await emit(ctx, brain.id, 'opportunity.created', { opportunityId: opportunity.id });
			return opportunity;
		}
		case 'cce_evaluate_opportunity': {
			const { strategy, themes, memory } = await brandContext(ctx, brandId);
			const opportunityId = inputString(input, 'opportunityId');
			if (!opportunityId) throw new AgentError('invalid_input', 'opportunityId is required.', 400);
			const opportunity = await getAgentStore().getOpportunity(ctx.credential.ownerUserId, opportunityId);
			if (!opportunity || !ctx.credential.allowedBrandIds.includes(opportunity.brandId)) {
				throw new AgentError('brand_not_accessible', 'This agent cannot access that opportunity.', 403);
			}
			const evaluation = evaluateOpportunity(opportunity, strategy, themes, memory);
			const next = { ...opportunity, status: 'evaluated' as const, evaluation };
			await getAgentStore().saveOpportunity(ctx.credential.ownerUserId, next);
			return { opportunityId, evaluation };
		}
		case 'cce_create_research_request': {
			const brain = await requireBrand(ctx, brandId);
			const sources = Array.isArray(input.sources) ? input.sources : [];
			const claims = Array.isArray(input.claims) ? input.claims : [];
			const record = await getAgentStore().saveResearch(ctx.credential.ownerUserId, {
				id: crypto.randomUUID(),
				brandId: brain.id,
				request: inputString(input, 'request') ?? '',
				sources: sources.filter((item) => item && typeof item === 'object').map((item) => item as { url?: string; title?: string; retrievedAt?: string; excerpt?: string }),
				claims: claims.filter((item) => item && typeof item === 'object').map((item) => item as { text: string; confidence?: string; sourceUrl?: string }),
				createdAt: new Date().toISOString(),
				note: 'Research claims are not Brand Brain facts.',
			});
			return record;
		}
		case 'cce_get_research': {
			const researchId = inputString(input, 'researchId');
			if (!researchId) throw new AgentError('invalid_input', 'researchId is required.', 400);
			const record = await getAgentStore().getResearch(ctx.credential.ownerUserId, researchId);
			if (!record || !ctx.credential.allowedBrandIds.includes(record.brandId)) {
				throw new AgentError('brand_not_accessible', 'This agent cannot access that research.', 403);
			}
			return record;
		}
		case 'cce_attach_research_to_brief': {
			const researchId = inputString(input, 'researchId');
			const briefId = inputString(input, 'briefId');
			if (!researchId || !briefId) throw new AgentError('invalid_input', 'researchId and briefId are required.', 400);
			const record = await getAgentStore().getResearch(ctx.credential.ownerUserId, researchId);
			const brief = await getAgentStore().getBrief(ctx.credential.ownerUserId, briefId);
			if (!record || !brief || record.brandId !== brief.brandId || !ctx.credential.allowedBrandIds.includes(record.brandId)) {
				throw new AgentError('brand_not_accessible', 'This agent cannot attach that research.', 403);
			}
			record.briefId = brief.id;
			brief.researchIds = [...new Set([...brief.researchIds, record.id])];
			await getAgentStore().saveResearch(ctx.credential.ownerUserId, record);
			await getAgentStore().saveBrief(ctx.credential.ownerUserId, brief);
			return { briefId: brief.id, researchId: record.id, promotedToBrandBrain: false };
		}
		case 'cce_research_brand':
		case 'cce_research_topic':
		case 'cce_research_competitors':
		case 'cce_research_reviews': {
			const brain = await requireBrand(ctx, brandId);
			const projectType: ResearchProjectType = name === 'cce_research_brand' ? 'BRAND_DISCOVERY' : name === 'cce_research_competitors' ? 'COMPETITOR_RESEARCH' : name === 'cce_research_reviews' ? 'REVIEW_RESEARCH' : 'CURRENT_RESEARCH';
			const query = inputString(input, 'query') ?? (projectType === 'BRAND_DISCOVERY' ? `Research ${brain.identity.name}` : '');
			if (!query) throw new AgentError('invalid_input', 'query is required.', 400);
			const record = await executeResearch({
				ownerUserId: ctx.credential.ownerUserId,
				brandId: brain.id,
				brandName: brain.identity.name,
				website: inputString(input, 'website'),
				query,
				projectType,
				brandFacts: brain.knowledge.brandFacts,
				search: configuredSearch(),
			});
			return publicResearch(record);
		}
		case 'cce_get_research_status': {
			const brain = await requireBrand(ctx, brandId);
			const records = await getAgentStore().listResearch(ctx.credential.ownerUserId, brain.id);
			return { research: records.map(publicResearch) };
		}
		case 'cce_get_sources':
		case 'cce_get_findings':
		case 'cce_get_claim_evidence':
		case 'cce_get_competitors':
		case 'cce_get_reviews_summary':
		case 'cce_get_trends':
		case 'cce_propose_brand_brain_updates': {
			const record = await ownedResearch(ctx, brandId, inputString(input, 'researchId'));
			if (name === 'cce_get_sources') return { sources: record.packet?.sources ?? record.sources };
			if (name === 'cce_get_findings') return { findings: record.packet?.findings ?? [] };
			if (name === 'cce_get_competitors') return { competitors: record.packet?.competitors ?? [] };
			if (name === 'cce_get_reviews_summary') return { summary: record.packet?.reviewSummary ?? 'No review summary is stored.', reviews: record.packet?.reviews ?? [] };
			if (name === 'cce_get_trends') return { trend: record.packet?.trend ?? { state: 'INSUFFICIENT_EVIDENCE', confidence: 'insufficient', sourceCount: 0, domainCount: 0, reason: 'No trend assessment is stored.' } };
			if (name === 'cce_propose_brand_brain_updates') return { proposals: record.packet?.proposals ?? [], promotedToBrandBrain: false };
			const claimId = inputString(input, 'claimId');
			const claim = record.packet?.claims.find((item) => item.id === claimId);
			if (!claim) throw new AgentError('invalid_input', 'claimId was not found on that research packet.', 404);
			return { claim, sources: record.packet?.sources.filter((source) => claim.sourceIds.includes(source.id)) ?? [] };
		}
		case 'cce_create_monitor': {
			const brain = await requireBrand(ctx, brandId);
			const monitorType = inputString(input, 'monitorType');
			const query = inputString(input, 'query');
			if (!monitorType || !(MONITOR_TYPES as readonly string[]).includes(monitorType) || !query) {
				throw new AgentError('invalid_input', 'monitorType and query are required.', 400);
			}
			const cadence = typeof input.cadenceDays === 'number' ? Math.min(30, Math.max(1, input.cadenceDays)) : 7;
			try {
				const monitor = await createMonitor(ctx.credential.ownerUserId, { brandId: brain.id, monitorType: monitorType as (typeof MONITOR_TYPES)[number], query, cadenceDays: cadence, status: 'active' });
				return { monitor, projectType: monitorProject(monitor.monitorType), note: 'The monitor stores a cadence. It does not crawl until a refresh runs.' };
			} catch (error) {
				if (error instanceof Error && error.message === 'monitor_limit_reached') throw new AgentError('monitor_limit_reached', 'This brand already has the maximum number of active monitors.', 429);
				throw error;
			}
		}
		case 'cce_get_monitors': {
			const brain = await requireBrand(ctx, brandId);
			return { monitors: await getAgentStore().listMonitors(ctx.credential.ownerUserId, brain.id) };
		}
		case 'cce_refresh_research': {
			const existing = await ownedResearch(ctx, brandId, inputString(input, 'researchId'));
			const brain = await requireBrand(ctx, existing.brandId);
			const record = await executeResearch({
				ownerUserId: ctx.credential.ownerUserId,
				brandId: brain.id,
				brandName: brain.identity.name,
				query: existing.request,
				projectType: existing.packet?.projectType ?? 'CURRENT_RESEARCH',
				brandFacts: brain.knowledge.brandFacts,
				search: configuredSearch(),
				researchDecision: 'REFRESH_EXISTING_RESEARCH',
			});
			return publicResearch(record);
		}
		case 'cce_get_drafts': {
			const { memory } = await brandContext(ctx, brandId);
			return { drafts: memory.filter((item) => ['draft', 'review', 'idea'].includes(String(item.publicationStatus))).map(publicContent) };
		}
		case 'cce_get_content': {
			const contentId = inputString(input, 'contentId');
			if (!contentId) throw new AgentError('invalid_input', 'contentId is required.', 400);
			return { content: publicContent(await requireContent(ctx, contentId)) };
		}
		case 'cce_create_brief': {
			const { brain, strategy, themes } = await brandContext(ctx, brandId);
			const themeId = inputString(input, 'themeId');
			const theme = themeId ? themes.find((item) => item.id === themeId) : themes.find((item) => item.status === 'active');
			const channels = inputStrings(input, 'channels') ?? [inputString(input, 'channel') ?? theme?.channels[0] ?? 'LINKEDIN_PERSONAL'];
			const brief = await getAgentStore().saveBrief(ctx.credential.ownerUserId, {
				id: crypto.randomUUID(),
				brandId: brain.id,
				objective: inputString(input, 'objective') ?? strategy?.objectives[0] ?? 'Support the active strategy',
				audience: strategy?.audiences[0]?.name,
				channel: channels[0],
				channels,
				instruction: inputString(input, 'instruction'),
				opportunityId: inputString(input, 'opportunityId'),
				themeId: theme?.id,
				assetIds: inputStrings(input, 'assetIds') ?? [],
				researchIds: [],
				status: 'open',
				createdAt: new Date().toISOString(),
				contentIds: [],
			});
			return { briefId: brief.id, objective: brief.objective, audience: brief.audience, channel: brief.channel, channels: brief.channels, themeId: brief.themeId, status: brief.status, mediaPlan: planMedia({ channel: brief.channel, topic: brief.instruction ?? brief.objective, objective: brief.objective }) };
		}
		case 'cce_generate_content': {
			const brain = await requireBrand(ctx, brandId);
			assertNative(brain);
			await assertBudget(ctx);
			const briefId = inputString(input, 'briefId');
			const brief = briefId ? await getAgentStore().getBrief(ctx.credential.ownerUserId, briefId) : null;
			if (briefId && (!brief || brief.brandId !== brain.id)) throw new AgentError('brand_not_accessible', 'This agent cannot access that brief.', 403);
			const channels = inputStrings(input, 'channels') ?? (inputString(input, 'channel') ? [inputString(input, 'channel') as string] : undefined) ?? brief?.channels ?? ['LINKEDIN_PERSONAL'];
			const instruction = brief?.instruction ?? inputString(input, 'instruction') ?? brief?.objective ?? inputString(input, 'objective');
			if (!instruction) throw new AgentError('invalid_input', 'A brief or instruction is required.', 400);
			const outputs = [];
			for (const channel of channels) {
				const output = await generateForChannel(ctx, brain, { instruction, channel, themeId: brief?.themeId ?? inputString(input, 'themeId'), objective: brief?.objective, researchIds: brief?.researchIds });
				outputs.push({
					...output,
					mediaPlan: planMedia({ channel, topic: output.topic ?? instruction, objective: brief?.objective, contentType: output.channel === 'blog' ? 'article' : 'founder_post' }),
				});
			}
			if (brief) {
				brief.status = 'generated';
				brief.contentIds = outputs.map((item) => item.contentId);
				await getAgentStore().saveBrief(ctx.credential.ownerUserId, brief);
			}
			return { outputs };
		}
		case 'cce_generate_from_opportunity': {
			const evaluation = (await dispatchAgentHandler('cce_evaluate_opportunity', ctx, input)) as { evaluation: { action: string; recommendedChannel?: string } };
			if (evaluation.evaluation.action !== 'draft') {
				return { generated: false, evaluation: evaluation.evaluation };
			}
			const brief = (await dispatchAgentHandler('cce_create_brief', ctx, {
				...input,
				channel: inputString(input, 'channel') ?? evaluation.evaluation.recommendedChannel,
				instruction: `Respond to opportunity ${inputString(input, 'opportunityId')}. Use the stored evaluation. Do not treat unverified claims as brand facts.`,
				opportunityId: inputString(input, 'opportunityId'),
			})) as { briefId: string };
			const generated = await dispatchAgentHandler('cce_generate_content', ctx, { ...input, briefId: brief.briefId });
			return { generated: true, briefId: brief.briefId, evaluation: evaluation.evaluation, ...(generated as object) };
		}
		case 'cce_request_revision': {
			const contentId = inputString(input, 'contentId');
			const instruction = inputString(input, 'instruction');
			if (!contentId || !instruction) throw new AgentError('invalid_input', 'contentId and instruction are required.', 400);
			const memory = await requireContent(ctx, contentId);
			const brain = await requireBrand(ctx, memory.brandBrainId);
			assertNative(brain);
			await assertBudget(ctx);
			const store = getIntelligenceStore();
			await store.saveDraft({ userId: ctx.credential.ownerUserId, brandBrainId: brain.id, memoryId: memory.id, aiVersion: memory.body ?? '' });
			const started = Date.now();
			const completion = await getIntelligenceAi().completeJson<{ draft?: string; body?: string }>(
				'WRITING',
				[
					{ role: 'system', content: 'Revise this brand content. Return JSON with a draft string. Keep the brand voice. Do not add claims that are not already in the brand context.' },
					{ role: 'user', content: `REVISION INSTRUCTION\n${instruction}\n\nCURRENT\n${memory.body ?? ''}` },
				],
				'agent_revision',
				ctx.credential.ownerUserId,
			);
			const revised = completion.data.draft || completion.data.body;
			if (!revised) throw new AgentError('ai_provider_unavailable', 'Revision did not return content.', 502, undefined, true);
			const brief: ContentBrief = {
				objective: 'authority',
				audience: brain.identity.audiences?.[0] ?? 'the brand audience',
				channel: memory.channel,
				contentType: memory.contentType ?? 'founder_post',
				funnelStage: 'awareness',
				topic: memory.topic ?? 'untitled',
				angle: memory.angle ?? memory.topic ?? 'untitled',
				hookDirection: memory.hook ?? '',
				centralArgument: memory.argument ?? '',
				supportingPoints: [],
				evidence: [],
				proofPoints: brain.knowledge.proofPoints ?? [],
				relevantBrandContext: [],
				voiceRequirements: [brain.voice.tone].filter((item): item is string => Boolean(item)),
				cta: memory.cta ?? '',
				guardrails: brain.guardrails.phrasesToAvoid ?? [],
				prohibitedPhrases: brain.guardrails.prohibitedClaims ?? [],
				relatedPreviousContent: [],
				differentiationFromRecent: [],
				sourceRequirements: [],
				optimizationObjective: 'authority',
			};
			const review = await completeReview({ draft: revised, brain, brief });
			const finalBody = review.improvedDraft || revised;
			await store.saveDraft({
				userId: ctx.credential.ownerUserId,
				brandBrainId: brain.id,
				memoryId: memory.id,
				aiVersion: finalBody,
				reviewedVersion: finalBody,
				reviewPayload: { materialPassed: review.materialPassed, revisionInstruction: instruction, actor: ctx.credential.id },
			});
			await store.saveMemory(ctx.credential.ownerUserId, { ...memory, body: finalBody });
			if (typeof completion.estimatedCostUsd === 'number') await getAgentStore().addCost(ctx.credential.id, completion.estimatedCostUsd);
			return {
				contentId: memory.id,
				body: finalBody,
				reviewPassed: review.materialPassed,
				modelRole: 'WRITING',
				model: completion.model ?? null,
				estimatedCostUsd: completion.estimatedCostUsd ?? null,
				processingMs: Date.now() - started,
			};
		}
		case 'cce_get_versions': {
			const contentId = inputString(input, 'contentId');
			if (!contentId) throw new AgentError('invalid_input', 'contentId is required.', 400);
			await requireContent(ctx, contentId);
			const versions = await getIntelligenceStore().listDrafts(ctx.credential.ownerUserId, contentId);
			return { contentId, versions };
		}
		case 'cce_compare_versions': {
			const contentId = inputString(input, 'contentId');
			if (!contentId) throw new AgentError('invalid_input', 'contentId is required.', 400);
			await requireContent(ctx, contentId);
			const versions = await getIntelligenceStore().listDrafts(ctx.credential.ownerUserId, contentId);
			const previous = versions.at(-2);
			const next = versions.at(-1);
			return {
				contentId,
				changed: previous && next ? previous.aiVersion !== next.aiVersion : false,
				previous: previous ? { id: previous.id, excerpt: previous.aiVersion.slice(0, 280) } : null,
				next: next ? { id: next.id, excerpt: next.aiVersion.slice(0, 280) } : null,
			};
		}
		case 'cce_get_pending_approvals': {
			const { memory } = await brandContext(ctx, brandId);
			return { approvals: memory.filter((item) => item.publicationStatus === 'review').map(publicContent), approver: 'human' };
		}
		case 'cce_submit_for_approval': {
			const contentId = inputString(input, 'contentId');
			if (!contentId) throw new AgentError('invalid_input', 'contentId is required.', 400);
			const memory = await requireContent(ctx, contentId);
			if (memory.publicationStatus === 'published') throw new AgentError('content_already_published', 'This content is already published.', 409);
			const publishAt = inputString(input, 'publishAt');
			const requestedAction = inputString(input, 'requestedAction') === 'approve_and_schedule' ? 'approve_and_schedule' : 'approve_content';
			const next = await getIntelligenceStore().saveMemory(ctx.credential.ownerUserId, {
				...memory,
				publicationStatus: 'review',
				publicationDate: memory.publicationDate,
				metadata: { ...(memory.metadata ?? {}), submittedForApprovalAt: new Date().toISOString(), submittedBy: ctx.credential.id, approver: 'human', proposedSchedule: publishAt ?? null },
			});
			await emit(ctx, memory.brandBrainId, 'content.ready_for_approval', { contentId: memory.id });
			const created = await createApprovalRequest({
				credential: ctx.credential,
				brandId: memory.brandBrainId,
				targetType: 'content',
				targetId: next.id,
				requestedAction,
				publishAt,
			});
			let queue: string = 'not_requested';
			if (process.env.AGENT_SUBMIT_TO_QUEUE === 'true') {
				const bridge = await import('@/lib/intelligence/queueBridge');
				if (!bridge.memoryBlocksQueueConfirm(next)) {
					const queued = await bridge.confirmMemoryToContentQueue({ store: getIntelligenceStore(), userId: ctx.credential.ownerUserId, memory: next });
					queue = queued.status;
				} else queue = 'held';
			}
			return {
				approvalRequestId: created.request.id,
				status: 'NEEDS_APPROVAL',
				awaitingApproval: true,
				approver: 'human',
				brandId: memory.brandBrainId,
				target: { type: 'content', id: next.id },
				summary: created.request.summary,
				approvalUrl: created.approvalUrl,
				expiresAt: created.request.expiresAt,
				proposedSchedule: publishAt ?? null,
				published: false,
				scheduled: false,
				queue,
			};
		}
		case 'cce_approve_content':
		case 'cce_reject_content': {
			const contentId = inputString(input, 'contentId');
			if (!contentId) throw new AgentError('invalid_input', 'contentId is required.', 400);
			const memory = await requireContent(ctx, contentId);
			const status = name === 'cce_approve_content' ? 'approved' : 'review';
			const next = await getIntelligenceStore().saveMemory(ctx.credential.ownerUserId, {
				...memory,
				publicationStatus: status,
				metadata: { ...(memory.metadata ?? {}), decisionBy: ctx.credential.id, decision: name, reason: inputString(input, 'reason') },
			});
			await emit(ctx, memory.brandBrainId, name === 'cce_approve_content' ? 'content.approved' : 'content.rejected', { contentId });
			return { content: publicContent(next), publisherArmed: false };
		}
		case 'cce_get_schedule_recommendation': {
			const { strategy, memory } = await brandContext(ctx, brandId);
			const snapshots = await getIntelligenceStore().listPerformance(ctx.credential.ownerUserId, (await requireBrand(ctx, brandId)).id);
			const sufficient = snapshots.length >= 8;
			return {
				sufficientHistory: sufficient,
				recommendation: sufficient ? 'History exists, but CCE does not claim a single best clock time.' : 'Use the channel cadence already in strategy. No statistically optimal time is available.',
				note: sufficient ? 'Observational only.' : INSUFFICIENT,
				cadence: strategy?.channelStrategies.map((channel) => ({ channel: channel.channel, cadence: channel.cadence })) ?? [],
				recentCount: memory.length,
			};
		}
		case 'cce_schedule_content':
		case 'cce_reschedule_content':
		case 'cce_unschedule_content': {
			const contentId = inputString(input, 'contentId');
			if (!contentId) throw new AgentError('invalid_input', 'contentId is required.', 400);
			const memory = await requireContent(ctx, contentId);
			if (memory.publicationStatus === 'published') throw new AgentError('content_already_published', 'Published content cannot be rescheduled here.', 409);
			if (name !== 'cce_unschedule_content' && !['approved', 'scheduled'].includes(String(memory.publicationStatus))) {
				throw new AgentError('content_not_approved', 'Only approved content can be scheduled.', 409);
			}
			if (name !== 'cce_unschedule_content') await assertScheduleMatchesApproval(memory);
			const publishAt = name === 'cce_unschedule_content' ? undefined : inputString(input, 'publishAt');
			const next = await getIntelligenceStore().saveMemory(ctx.credential.ownerUserId, {
				...memory,
				publicationStatus: name === 'cce_unschedule_content' ? 'approved' : 'scheduled',
				publicationDate: publishAt,
			});
			await emit(ctx, memory.brandBrainId, name === 'cce_unschedule_content' ? 'content.unscheduled' : 'content.scheduled', { contentId, publishAt });
			return { content: publicContent(next), publisherArmed: false, note: 'The external publisher is not armed by this call.' };
		}
		case 'cce_get_content_performance': {
			const contentId = inputString(input, 'contentId');
			if (!contentId) throw new AgentError('invalid_input', 'contentId is required.', 400);
			const memory = await requireContent(ctx, contentId);
			const snapshots = (await getIntelligenceStore().listPerformance(ctx.credential.ownerUserId, memory.brandBrainId)).filter((item) => item.memoryId === contentId);
			return { contentId, ...performanceSummary(snapshots) };
		}
		case 'cce_get_channel_performance': {
			const brain = await requireBrand(ctx, brandId);
			const channel = resolveChannel(inputString(input, 'channel'))?.pipelineChannel;
			const snapshots = (await getIntelligenceStore().listPerformance(ctx.credential.ownerUserId, brain.id)).filter((item) => !channel || item.channel === channel);
			return { channel: channel ?? 'all', ...performanceSummary(snapshots) };
		}
		case 'cce_get_top_content': {
			const brain = await requireBrand(ctx, brandId);
			const snapshots = await getIntelligenceStore().listPerformance(ctx.credential.ownerUserId, brain.id);
			if (snapshots.length < 4) return { history: 'insufficient', note: INSUFFICIENT, top: [], underperforming: [] };
			const ranked = [...snapshots].sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0));
			return { history: 'limited', note: 'Ranking is observational and only includes stored snapshots.', top: ranked.slice(0, 3), underperforming: ranked.slice(-3) };
		}
		case 'cce_get_performance_baseline': {
			const brain = await requireBrand(ctx, brandId);
			const channel = resolveChannel(inputString(input, 'channel'))?.pipelineChannel ?? 'linkedin';
			const snapshots = await getIntelligenceStore().listPerformance(ctx.credential.ownerUserId, brain.id);
			const baseline = computeBaseline({ snapshots, channel, objective: 'engagement' });
			return { ...baseline, insufficient: baseline.confidence === 'insufficient' };
		}
		case 'cce_compare_content': {
			const ids = inputStrings(input, 'contentIds') ?? [];
			const rows = [];
			for (const contentId of ids) {
				rows.push(await dispatchAgentHandler('cce_get_content_performance', ctx, { ...input, contentId }));
			}
			const comparable = rows.every((row) => (row as { history?: string }).history === 'available');
			return { comparable, note: comparable ? 'Observational comparison only.' : INSUFFICIENT, rows };
		}
		case 'cce_get_learnings': {
			const brain = await requireBrand(ctx, brandId);
			const store = getIntelligenceStore();
			const [learnings, edits] = await Promise.all([
				store.listLearnings(ctx.credential.ownerUserId, brain.id),
				store.listEditLearnings(ctx.credential.ownerUserId, brain.id),
			]);
			return {
				content: learnings,
				edits,
				performance: learnings.filter((item) => item.scope === 'performance'),
				experiments: learnings.filter((item) => item.scope === 'experiment'),
			};
		}
		case 'cce_propose_learning': {
			const brain = await requireBrand(ctx, brandId);
			const learning = await getIntelligenceStore().saveEditLearning(ctx.credential.ownerUserId, {
				brandBrainId: brain.id,
				signalType: 'agent_proposal',
				observation: inputString(input, 'observation') ?? '',
				confidence: 'candidate',
				status: 'proposed',
				occurrenceCount: 1,
			});
			return { learning, brandBrainChanged: false, confidence: 'candidate' };
		}
		case 'cce_get_experiments': {
			const brain = await requireBrand(ctx, brandId);
			const experiments = await getIntelligenceStore().listExperiments(ctx.credential.ownerUserId, brain.id);
			return { experiments: experiments.map((experiment) => ({ id: experiment.id, title: experiment.title, status: experiment.status, confidence: experiment.confidence, winner: experiment.winnerVariantId ?? null, hypothesis: experiment.hypothesis })) };
		}
		case 'cce_propose_experiment': {
			const { brain, themes, memory } = await brandContext(ctx, brandId);
			const snapshots = await getIntelligenceStore().listPerformance(ctx.credential.ownerUserId, brain.id);
			const usage = themes.map((theme) => ({ theme, count: memory.filter((item) => item.themeId === theme.id).length }));
			const most = [...usage].sort((a, b) => b.count - a.count)[0];
			const least = [...usage].sort((a, b) => a.count - b.count)[0];
			const imbalance = most && least && most.theme.id !== least.theme.id && most.count >= 3 && least.count === 0;
			if (!imbalance && snapshots.length < 8) {
				return { proposed: false, code: 'insufficient_history', reason: 'Stored evidence does not yet support an experiment. No winner is claimed.' };
			}
			const experiment = await getIntelligenceStore().saveExperiment(ctx.credential.ownerUserId, {
				brandBrainId: brain.id,
				title: imbalance ? `Theme mix: ${most.theme.title} and ${least.theme.title}` : inputString(input, 'hypothesis') ?? 'Performance follow-up',
				hypothesis: imbalance ? `${least.theme.title} may deserve a turn after ${most.theme.title} has dominated recent output. This is a mix test, not a performance winner.` : inputString(input, 'hypothesis') ?? 'A difference may be worth measuring once the sample is large enough.',
				variable: imbalance ? 'theme' : 'message',
				primaryMetric: 'engagement_rate',
				secondaryMetrics: ['comments'],
				objective: 'authority',
				status: 'proposed',
				minimumSample: 8,
				measurementWindowHours: 168,
				confidence: 'low',
				notes: 'No winner. Confidence stays low until the minimum sample exists.',
			});
			return { proposed: true, experimentId: experiment.id, confidence: 'low', winner: null, reason: experiment.hypothesis };
		}
		case 'cce_analyse_experiment': {
			const experimentId = inputString(input, 'experimentId');
			if (!experimentId) throw new AgentError('invalid_input', 'experimentId is required.', 400);
			const experiment = await getIntelligenceStore().getExperiment(ctx.credential.ownerUserId, experimentId);
			if (!experiment || !ctx.credential.allowedBrandIds.includes(experiment.brandBrainId)) {
				throw new AgentError('brand_not_accessible', 'This agent cannot access that experiment.', 403);
			}
			const results = await getIntelligenceStore().listExperimentResults(ctx.credential.ownerUserId, experiment.id);
			const analysis = analyseExperiment({ experiment, results });
			return { ...analysis, winnerClaimed: Boolean(analysis.ready && analysis.winnerVariantId) };
		}
		case 'cce_get_engagement_inbox': {
			const brain = await requireBrand(ctx, brandId);
			return { interactions: await getAgentStore().listInteractions(ctx.credential.ownerUserId, brain.id) };
		}
		case 'cce_draft_reply': {
			const brain = await requireBrand(ctx, brandId);
			const existingId = inputString(input, 'interactionId');
			const existing = existingId ? await getAgentStore().getInteraction(ctx.credential.ownerUserId, existingId) : null;
			const interaction = await getAgentStore().saveInteraction(ctx.credential.ownerUserId, {
				id: existing?.id ?? crypto.randomUUID(),
				brandId: brain.id,
				platform: inputString(input, 'platform') ?? existing?.platform ?? 'unknown',
				externalPostId: inputString(input, 'externalPostId') ?? existing?.externalPostId,
				externalInteractionId: existing?.externalInteractionId,
				type: existing?.type ?? 'reply_draft',
				text: existing?.text,
				responseStatus: 'drafted',
				draftReply: inputString(input, 'text'),
				createdAt: existing?.createdAt ?? new Date().toISOString(),
			});
			return { interactionId: interaction.id, status: 'drafted', published: false };
		}
		case 'cce_request_reply_approval': {
			const interactionId = inputString(input, 'interactionId');
			if (!interactionId) throw new AgentError('invalid_input', 'interactionId is required.', 400);
			const interaction = await getAgentStore().getInteraction(ctx.credential.ownerUserId, interactionId);
			if (!interaction || !ctx.credential.allowedBrandIds.includes(interaction.brandId)) {
				throw new AgentError('brand_not_accessible', 'This agent cannot access that interaction.', 403);
			}
			if (!interaction.draftReply) throw new AgentError('invalid_input', 'Draft a reply before requesting approval.', 400);
			interaction.responseStatus = 'awaiting_approval';
			await getAgentStore().saveInteraction(ctx.credential.ownerUserId, interaction);
			await emit(ctx, interaction.brandId, 'community.reply_needed', { interactionId });
			return { interactionId, status: 'awaiting_approval', approver: 'human', published: false };
		}
		case 'cce_record_external_publish': {
			const contentId = inputString(input, 'contentId') ?? inputString(input, 'articleId');
			const externalUrl = inputString(input, 'externalUrl');
			if (!contentId || !externalUrl) throw new AgentError('invalid_input', 'contentId and externalUrl are required.', 400);
			assertHttpsUrl(externalUrl);
			const article = await getNativeContentStore().getArticle(ctx.credential.ownerUserId, contentId);
			if (article) {
				if (!ctx.credential.allowedBrandIds.includes(article.brandId)) {
					throw new AgentError('brand_not_accessible', 'This agent cannot access that article.', 403);
				}
				if (article.approval.status !== 'approved') {
					throw new AgentError('content_not_approved', 'Record an article publication only after a human has approved it. This call did not publish.', 403);
				}
				article.publication = {
					destination: inputString(input, 'channel') ?? 'external',
					externalId: inputString(input, 'externalId'),
					url: externalUrl,
					publishedAt: inputString(input, 'publishedAt') ?? new Date().toISOString(),
					method: 'external',
				};
				article.status = 'published';
				article.updatedAt = new Date().toISOString();
				await getNativeContentStore().saveArticle(article);
				await emit(ctx, article.brandId, 'content.published', { articleId: article.id, source: 'external_record' });
				return { articleId: article.id, performanceContentId: article.performanceContentId, recorded: true, publishedByCce: false };
			}
			const memory = await requireContent(ctx, contentId);
			const next = await getIntelligenceStore().saveMemory(ctx.credential.ownerUserId, {
				...memory,
				publicationStatus: 'published',
				channel: resolveChannel(inputString(input, 'channel'))?.pipelineChannel ?? memory.channel,
				externalPostId: inputString(input, 'externalId'),
				externalUrl,
				publicationDate: inputString(input, 'publishedAt') ?? new Date().toISOString(),
				metadata: { ...(memory.metadata ?? {}), externalMethod: inputString(input, 'method') ?? 'external', recordedBy: ctx.credential.id },
			});
			await emit(ctx, memory.brandBrainId, 'content.published', { contentId, source: 'external_record' });
			return { content: publicContent(next), recorded: true, publishedByCce: false };
		}
		case 'cce_record_external_engagement': {
			const brain = await requireBrand(ctx, brandId);
			const channel = resolveChannel(inputString(input, 'channel'))?.pipelineChannel ?? inputString(input, 'channel') ?? 'other';
			const contentId = inputString(input, 'contentId');
			if (contentId) await requireContent(ctx, contentId);
			const snapshot = await getIntelligenceStore().savePerformance(ctx.credential.ownerUserId, {
				...snapshotFromManualMetrics({
					channel,
					memoryId: contentId,
					impressions: typeof input.impressions === 'number' ? input.impressions : undefined,
					clicks: typeof input.clicks === 'number' ? input.clicks : undefined,
					reactions: typeof input.reactions === 'number' ? input.reactions : undefined,
					comments: typeof input.comments === 'number' ? input.comments : undefined,
					shares: typeof input.shares === 'number' ? input.shares : undefined,
				}),
				brandBrainId: brain.id,
			});
			return { snapshotId: snapshot.id, source: inputString(input, 'source'), reliability: inputString(input, 'reliability') ?? 'manual', organic: true, completeness: 'partial' };
		}
		case 'cce_get_ad_campaigns':
		case 'cce_get_ad_performance':
		case 'cce_analyse_ad_performance':
			await requireBrand(ctx, brandId);
			return { available: false, code: 'analytics_unavailable', campaigns: [], note: 'No paid account is connected. Nothing was changed.' };
		case 'cce_propose_ad_campaign': {
			const brain = await requireBrand(ctx, brandId);
			const proposal = await getAgentStore().saveAdProposal(ctx.credential.ownerUserId, {
				id: crypto.randomUUID(),
				brandId: brain.id,
				platform: inputString(input, 'platform') ?? 'unknown',
				proposedState: 'paused_draft',
				reason: inputString(input, 'reason') ?? '',
				confidence: 'low',
				createdBy: ctx.credential.id,
				createdAt: new Date().toISOString(),
				approvalStatus: 'pending',
				expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
				evidence: inputString(input, 'summary'),
			});
			return { proposalId: proposal.id, status: 'proposed', activated: false, createdOnPlatform: false };
		}
		case 'cce_propose_budget_change': {
			const brain = await requireBrand(ctx, brandId);
			const summary = inputString(input, 'reason') ?? 'Budget change requested';
			const response = await proposalResponse(ctx, brain.id, summary, 'budget_change_not_applied', { currentState: 'unchanged' });
			await getAgentStore().saveAdProposal(ctx.credential.ownerUserId, {
				id: response.approvalId,
				brandId: brain.id,
				platform: inputString(input, 'platform') ?? 'unknown',
				campaign: inputString(input, 'campaign'),
				currentState: 'unchanged',
				proposedState: summary,
				reason: summary,
				confidence: 'low',
				dailyBudgetDelta: inputString(input, 'dailyBudgetDelta'),
				totalBudgetDelta: inputString(input, 'totalBudgetDelta'),
				createdBy: ctx.credential.id,
				createdAt: new Date().toISOString(),
				approvalStatus: 'pending',
				expiresAt: response.expiresAt,
			});
			return response;
		}
		case 'cce_create_approval_request': {
			const brain = await requireBrand(ctx, brandId);
			const targetType = inputString(input, 'targetType') === 'article' ? 'article' : 'content';
			const targetId = inputString(input, 'targetId') ?? inputString(input, 'contentId') ?? inputString(input, 'articleId');
			const requestedAction = inputString(input, 'requestedAction') === 'approve_and_schedule' ? 'approve_and_schedule' : 'approve_content';
			if (!targetId) throw new AgentError('invalid_input', 'targetId is required.', 400);
			const created = await createApprovalRequest({
				credential: ctx.credential,
				brandId: brain.id,
				targetType,
				targetId,
				requestedAction,
				publishAt: inputString(input, 'publishAt'),
			});
			return {
				id: created.request.id,
				status: created.request.status,
				expiresAt: created.request.expiresAt,
				approvalUrl: created.approvalUrl,
				requestedAction: created.request.requestedAction,
				published: false,
				approvedByAgent: false,
			};
		}
		case 'cce_get_approval_request': {
			const id = inputString(input, 'approvalId') ?? inputString(input, 'id');
			if (!id) throw new AgentError('invalid_input', 'approvalId is required.', 400);
			const request = await getAgentStore().getApprovalRequest(id);
			if (!request || request.ownerUserId !== ctx.credential.ownerUserId || !ctx.credential.allowedBrandIds.includes(request.brandId)) {
				throw new AgentError('brand_not_accessible', 'This agent cannot access that approval request.', 403);
			}
			return { id: request.id, status: request.status, brandId: request.brandId, targetType: request.targetType, targetId: request.targetId, requestedAction: request.requestedAction, expiresAt: request.expiresAt, resolvedAt: request.resolvedAt ?? null, executionStatus: request.executionStatus };
		}
		case 'cce_list_approval_requests': {
			const brain = await requireBrand(ctx, brandId);
			const rows = await getAgentStore().listApprovalRequests(ctx.credential.ownerUserId, 'PENDING');
			return { requests: rows.filter((row) => row.brandId === brain.id).map((row) => ({ id: row.id, status: row.status, summary: row.summary, targetType: row.targetType, targetId: row.targetId, expiresAt: row.expiresAt })) };
		}
		case 'cce_resolve_approval_request':
			throw new AgentError('human_authorization_required', 'An agent credential cannot approve. The CCE account owner must open the approval link and confirm.', 403);
		case 'cce_get_marketing_brief':
			return getMarketingBrief(ctx, input);
		case 'cce_get_next_best_actions':
			return nextBestActions(ctx, input);
		case 'cce_record_agent_feedback': {
			const brain = await requireBrand(ctx, brandId);
			const saved = await getAgentStore().saveFeedback(ctx.credential.ownerUserId, {
				id: crypto.randomUUID(),
				brandId: brain.id,
				subjectType: inputString(input, 'subjectType') ?? 'general',
				subjectId: inputString(input, 'subjectId'),
				note: inputString(input, 'note') ?? '',
				actor: ctx.credential.id,
				createdAt: new Date().toISOString(),
				appliedToBrandBrain: false,
			});
			return { id: saved.id, appliedToBrandBrain: false };
		}
		case 'cce_attach_asset': {
			const assetId = inputString(input, 'assetId');
			const targetId = inputString(input, 'targetId') ?? inputString(input, 'contentId') ?? inputString(input, 'articleId') ?? inputString(input, 'briefId');
			const targetType = (inputString(input, 'targetType') ?? (inputString(input, 'articleId') ? 'article' : inputString(input, 'briefId') ? 'brief' : 'content')) as 'content' | 'article' | 'brief' | 'version' | 'section' | 'campaign';
			if (!assetId || !targetId) throw new AgentError('invalid_input', 'assetId and a target id are required.', 400);
			const asset = await getNativeContentStore().getAsset(ctx.credential.ownerUserId, assetId);
			if (!asset || (asset.brandId && !ctx.credential.allowedBrandIds.includes(asset.brandId))) {
				throw new AgentError('brand_not_accessible', 'This agent cannot access that asset.', 403);
			}
			await getNativeContentStore().saveLink({
				id: crypto.randomUUID(),
				ownerUserId: ctx.credential.ownerUserId,
				assetId,
				targetType,
				targetId,
				role: inputString(input, 'role'),
				createdAt: new Date().toISOString(),
			});
			if (targetType === 'article') {
				const article = await getNativeContentStore().getArticle(ctx.credential.ownerUserId, targetId);
				if (article && ctx.credential.allowedBrandIds.includes(article.brandId) && !article.featuredAssetId) {
					article.featuredAssetId = assetId;
					article.updatedAt = new Date().toISOString();
					await getNativeContentStore().saveArticle(article);
				}
			}
			const briefId = inputString(input, 'briefId');
			if (briefId) {
				const current = await getAgentStore().getBrief(ctx.credential.ownerUserId, briefId);
				if (!current || !ctx.credential.allowedBrandIds.includes(current.brandId)) {
					throw new AgentError('brand_not_accessible', 'This agent cannot access that brief.', 403);
				}
				current.assetIds = [...new Set([...current.assetIds, assetId])];
				await getAgentStore().saveBrief(ctx.credential.ownerUserId, current);
			}
			return { asset: publicAsset(asset), targetId, attached: true, published: false };
		}
		default: {
			const extra = await dispatchContentExtensions(name, ctx, input);
			if (extra !== undefined) return extra;
			throw new AgentError('unknown_action', `Unknown agent action ${name}.`, 404);
		}
	}
}
