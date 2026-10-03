import 'server-only';

import { classifyLlmFailure } from '@/lib/ai/complete';
import { MODEL_ROLES, getRoleConfig } from '@/lib/ai/roles';
import { completeStructuredJson, LlmError } from '@/lib/llm';
import { resolveModelRequestProfile, type ReasoningEffort } from '@/lib/llm/modelAdapter';
import { listRecords } from '@/lib/airtable/client';
import { getSupabaseService } from '@/lib/supabaseService';
import { generateSeries } from '@/lib/idea-engine/generator/generateSeries';
import { readContentQueueField } from '@/lib/idea-engine/airtable/contentQueueQuery';
import { createSupabaseIntelligenceStore } from '../supabaseStore';
import { runContentIntelligencePipeline } from '../pipeline';
import { confirmMemoryToContentQueue } from '../queueBridge';
import { ensureFolianNativeBrand } from './ensureFolian';
import { estimateModelCostUsd } from '@/lib/ai/pricing';
import type { ContentMemoryRecord } from '../types';

async function reuseAcceptanceDraft(admin: ReturnType<typeof getSupabaseService>, memory: ContentMemoryRecord) {
	const { data: drafts, error } = await admin
		.from('content_drafts')
		.select('ai_version, reviewed_version, review_payload, brief_id')
		.eq('memory_id', memory.id)
		.order('created_at', { ascending: false })
		.limit(1);
	if (error || !drafts?.[0]) throw new Error(error?.message || 'Acceptance draft was not persisted');
	const draft = drafts[0];
	const { data: brief, error: briefError } = await admin
		.from('native_content_briefs')
		.select('id, payload')
		.eq('id', draft.brief_id)
		.maybeSingle();
	if (briefError || !brief) throw new Error(briefError?.message || 'Acceptance brief was not persisted');
	return {
		brief: { id: String(brief.id), payload: brief.payload as Record<string, unknown> },
		aiDraft: String(draft.ai_version || ''),
		reviewedDraft: String(draft.reviewed_version || draft.ai_version || ''),
		review: draft.review_payload,
		memory,
	};
}

export type ModelProbe = {
	role: string;
	provider: 'openai';
	requestedModel: string;
	actualModel?: string;
	success: boolean;
	latencyMs: number;
	promptTokens?: number;
	completionTokens?: number;
	error?: string;
	classification?: string;
	fallbackUsed: false;
	endpoint?: string;
	reasoningEffort?: ReasoningEffort;
};

const GPT6_PROBE_TARGETS: Array<{ model: string; reasoningEffort: ReasoningEffort; maxTokens: number }> = [
	{ model: 'gpt-6-luna', reasoningEffort: 'none', maxTokens: 128 },
	{ model: 'gpt-6.1-sol', reasoningEffort: 'low', maxTokens: 512 },
];

export async function probeConfiguredModels(): Promise<ModelProbe[]> {
	const probes: ModelProbe[] = [];
	for (const target of GPT6_PROBE_TARGETS) {
		const profile = resolveModelRequestProfile(target.model, target.reasoningEffort);
		const started = Date.now();
		try {
			const result = await completeStructuredJson<{ ok?: boolean }>({
				model: target.model,
				messages: [
					{ role: 'system', content: 'Return JSON only.' },
					{ role: 'user', content: 'Reply with {"ok":true}.' },
				],
				maxTokens: target.maxTokens,
				reasoningEffort: profile.reasoningEffort,
				timeoutMs: 60_000,
			});
			probes.push({
				role: target.model,
				provider: 'openai',
				requestedModel: target.model,
				actualModel: result.model,
				success: true,
				latencyMs: Date.now() - started,
				promptTokens: result.rawUsage?.promptTokens,
				completionTokens: result.rawUsage?.completionTokens,
				fallbackUsed: false,
				endpoint: profile.api,
				reasoningEffort: profile.reasoningEffort,
			});
		} catch (error) {
			probes.push({
				role: target.model,
				provider: 'openai',
				requestedModel: target.model,
				success: false,
				latencyMs: Date.now() - started,
				error: error instanceof LlmError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : 'unknown',
				classification: classifyLlmFailure(error),
				fallbackUsed: false,
				endpoint: profile.api,
				reasoningEffort: profile.reasoningEffort,
			});
		}
	}
	return probes;
}

export async function runIdeaEngineDiagnostic(userId: string, brandProfileId: string): Promise<{
	runId: string;
	status: string;
	error: string | null;
	generationStage: string | null;
}> {
	const admin = getSupabaseService();
	const { data: run, error } = await admin
		.from('idea_engine_runs')
		.insert({
			user_id: userId,
			brand_profile_id: brandProfileId,
			idea: 'CCE diagnostic connectivity test. Write one short LinkedIn sentence. Do not publish.',
			selected_channels: ['LinkedIn'],
			publish_mode: 'queue_only',
			status: 'generating',
			total_expected: 1,
			total_generated: 0,
		})
		.select('id')
		.single();
	if (error || !run) throw new Error(error?.message || 'Failed to create diagnostic run');

	await admin.from('idea_engine_items').insert({
		run_id: run.id,
		user_id: userId,
		channel: 'LinkedIn',
		series_position: 1,
		series_total: 1,
		status: 'generating',
	});

	await generateSeries(run.id);

	const { data: after } = await admin
		.from('idea_engine_runs')
		.select('status, error, generation_stage')
		.eq('id', run.id)
		.single();

	const status = String(after?.status || 'missing');
	if (status === 'generating') {
		throw new Error(`Diagnostic run ${run.id} remained generating`);
	}
	return {
		runId: run.id,
		status,
		error: after?.error ? String(after.error) : null,
		generationStage: after?.generation_stage ? String(after.generation_stage) : null,
	};
}

export async function activateFolianNativeJourney(options?: {
	skipIdeaEngineDiagnostic?: boolean;
}): Promise<Record<string, unknown>> {
	const admin = getSupabaseService();
	const { data: priorRun } = await admin
		.from('idea_engine_runs')
		.select('user_id')
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	const userId = process.env.SIDECAR_OWNER_USER_ID || priorRun?.user_id;
	if (!userId) throw new Error('No user id available for Folian activation');

	const store = createSupabaseIntelligenceStore();
	const native = await ensureFolianNativeBrand(store, userId);
	const brain = await store.getBrandBrain(userId, native.airtableBrandId);
	const strategy = await store.getStrategyForBrand(userId, native.brandId);
	if (!brain || !strategy) throw new Error('Folian native brand was not persisted');

	const queueTable = process.env.AIRTABLE_CONTENTQUEUE_TABLE;
	if (!queueTable) throw new Error('AIRTABLE_CONTENTQUEUE_TABLE missing');
	const history = await listRecords({
		table: queueTable,
		filterByFormula: `FIND("${native.airtableBrandId}", ARRAYJOIN({brand_profile_id}))`,
		maxRecords: 100,
		fields: ['platform', 'status', 'hook', 'post_content', 'brand_profile_id', 'created_time'],
		returnFieldsByFieldId: true,
		cache: false,
		endpoint: '/internal/folian-memory',
	});
	const existing = await store.listMemory(userId, brain.id);
	const seen = new Set(existing.map((row) => row.airtableContentId).filter(Boolean));
	let ingested = 0;
	for (const record of history) {
		if (seen.has(record.id)) continue;
		const hook = readContentQueueField(record, 'hook');
		const body = readContentQueueField(record, 'post_content');
		const platform = readContentQueueField(record, 'platform') || 'linkedin';
		const status = readContentQueueField(record, 'status');
		if (!hook && !body) continue;
		await store.saveMemory(userId, {
			brandBrainId: brain.id,
			channel: platform.toLowerCase().includes('link') ? 'linkedin' : platform.toLowerCase(),
			contentType: 'founder_post',
			hook: hook || undefined,
			body: body || undefined,
			topic: hook || undefined,
			airtableContentId: record.id,
			publicationStatus: status.toLowerCase().includes('publish') ? 'published' : 'approved',
			publicationDate: readContentQueueField(record, 'created_time') || undefined,
			metadata: { ingested_from: 'content_queue', queue_status: status },
		});
		seen.add(record.id);
		ingested += 1;
	}

	const ideaEngine = options?.skipIdeaEngineDiagnostic ? null : await runIdeaEngineDiagnostic(userId, native.airtableBrandId);
	const historyNote = ingested === 0 ? 'insufficient history for performance-informed optimisation' : null;
	const acceptanceIntent = 'Create the next Folian LinkedIn post.';
	const pending = existing.find(
		(row) => !row.airtableContentId && row.channel === 'linkedin' && Boolean(row.body) && row.sourceIdea === acceptanceIntent,
	);

	const generation = pending
		? await reuseAcceptanceDraft(admin, pending)
		: await runContentIntelligencePipeline(store, {
			userId,
			airtableBrandId: native.airtableBrandId,
			userIntent: acceptanceIntent,
			channel: 'linkedin',
			contentType: 'founder_post',
			allowThemeContinuation: true,
		});

	const queued = await confirmMemoryToContentQueue({
		store,
		userId,
		memory: generation.memory,
		clientName: brain.identity.name,
	});
	const queuedAgain = await confirmMemoryToContentQueue({
		store,
		userId,
		memory: { ...generation.memory, airtableContentId: queued.airtableRecordId },
		clientName: brain.identity.name,
	});
	await admin.from('airtable_entity_map').upsert(
		{
			user_id: userId,
			airtable_table: queueTable,
			airtable_record_id: queued.airtableRecordId,
			native_entity_type: 'content_memory',
			native_entity_id: generation.memory.id,
		},
		{ onConflict: 'airtable_table,airtable_record_id,native_entity_type' },
	);

	const token = process.env.AIRTABLE_PAT!;
	const baseId = process.env.AIRTABLE_BASE_ID!;
	const readBack = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(queueTable)}/${queued.airtableRecordId}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const record = (await readBack.json()) as { fields?: Record<string, unknown> };
	const queueFields = record.fields || {};
	const lookupUser = queueFields.user_id_lookup;
	const lookupUserId = Array.isArray(lookupUser) ? String(lookupUser[0] || '') : typeof lookupUser === 'string' ? lookupUser : '';
	const recordId = queued.airtableRecordId.replace(/"/g, '');
	const approvalFormula = lookupUserId
		? `AND(RECORD_ID()="${recordId}", FIND("${lookupUserId.replace(/"/g, '')}", ARRAYJOIN({user_id_lookup}, ",")), OR({platform}="LinkedIn", FIND("LinkedIn", {platform})>0), OR({status}="Needs Approval", {status}="Needs Copy", {status}="Needs Review", {status}="Draft"))`
		: '';
	const publisherFormula = `AND(RECORD_ID()="${recordId}", {platform}="LinkedIn", {status}="Ready To Publish", OR({publish_attempts}<3, {publish_attempts}=BLANK()))`;
	const approvalMatches = approvalFormula
		? await listRecords({
			table: queueTable,
			filterByFormula: approvalFormula,
			maxRecords: 1,
			fields: ['status', 'platform'],
			returnFieldsByFieldId: false,
			cache: false,
			endpoint: '/internal/folian-approval-check',
		})
		: [];
	const publisherMatches = await listRecords({
		table: queueTable,
		filterByFormula: publisherFormula,
		maxRecords: 1,
		fields: ['status', 'platform'],
		returnFieldsByFieldId: false,
		cache: false,
		endpoint: '/internal/folian-publisher-check',
	});

	const { data: writingLog } = await admin
		.from('ai_usage_logs')
		.select('role, provider, model, fallback_used, error_code, duration_ms, prompt_tokens, completion_tokens, ok, feature')
		.eq('feature', 'intelligence_draft')
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	const { data: reviewLog } = await admin
		.from('ai_usage_logs')
		.select('role, provider, model, fallback_used, error_code, duration_ms, prompt_tokens, completion_tokens, ok, feature')
		.eq('feature', 'intelligence_review')
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	const writingCost = estimateModelCostUsd({
		model: String(writingLog?.model || getRoleConfig('WRITING').preferred),
		inputTokens: writingLog?.prompt_tokens,
		outputTokens: writingLog?.completion_tokens,
	});
	const reviewCost = estimateModelCostUsd({
		model: String(reviewLog?.model || getRoleConfig('REVIEW').preferred),
		inputTokens: reviewLog?.prompt_tokens,
		outputTokens: reviewLog?.completion_tokens,
	});

	return {
		roles: MODEL_ROLES.map((role) => ({ role, model: getRoleConfig(role).preferred, provider: 'openai' })),
		canonicalBrandId: native.brandId,
		airtableBrandId: native.airtableBrandId,
		brandMappingId: native.mappingId,
		airtableBrandCreated: native.airtableCreated,
		brainId: brain.id,
		brainName: brain.identity.name,
		incomplete: native.incomplete,
		brainIdentity: brain.identity,
		strategyId: strategy.id,
		strategyPositioning: strategy.positioning ?? null,
		strategyObjectives: strategy.objectives,
		strategyPillars: strategy.contentPillars,
		themeTitles: native.themeTitles,
		historyNote,
		memoryIngested: ingested,
		memoryRetrieved: generation.brief.payload.relatedPreviousContent,
		brief: generation.brief.payload,
		aiDraft: generation.aiDraft,
		review: generation.review,
		finalDraft: generation.reviewedDraft,
		writingInvocation: writingLog,
		reviewInvocation: reviewLog,
		estimatedCostUsd: {
			writing: writingCost,
			review: reviewCost,
		},
		ideaEngine,
		queue: queued,
		queueIdempotentRetry: queuedAgain.idempotent,
		queueReadback: {
			platform: queueFields.platform,
			status: queueFields.status,
			hasBody: Boolean(queueFields.post_content),
			hasBrand: Array.isArray(queueFields.brand_profile_id) && queueFields.brand_profile_id.length > 0,
			generatedFrom: queueFields.generated_from,
			hasUserLookup: Boolean(lookupUserId),
		},
		approvalQueryMatched: approvalMatches.length === 1,
		publisherWouldSelect: publisherMatches.length === 1,
		publisherWouldPublishNow: queueFields.status === 'Ready To Publish',
		publisherFieldShapeReady: queueFields.platform === 'LinkedIn' && Boolean(queueFields.post_content),
	};
}
