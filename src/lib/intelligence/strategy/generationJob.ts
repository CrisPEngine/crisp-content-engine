import 'server-only';

import { getAgentStore } from '@/lib/agent/controlStore';
import { getIntelligenceStore } from '../actions';
import { enqueueWorkflowJob } from '../jobs';
import type { WorkflowJob } from '../types';
import { generateNativeStrategy } from './generateNativeStrategy';
import { strategyRowToSnapshotPayload } from './strategyDraftStore';

export type StrategyGenerationJobPayload = {
	airtableBrandId: string;
	brandBrainId?: string;
	researchId?: string;
	instructions?: string;
	escalate?: boolean;
	source?: string;
};

export type StrategyGenerationJobResult = {
	draftReady?: boolean;
	modelRole?: string;
	model?: string;
	error?: string;
};

export function strategyGenerationRunsInline(): boolean {
	if (process.env.STRATEGY_GENERATION_INLINE === 'true') return true;
	if (process.env.NODE_ENV === 'test') return true;
	return false;
}

export async function enqueueNativeStrategyGeneration(input: {
	ownerUserId: string;
	airtableBrandId: string;
	brandBrainId?: string;
	researchId?: string;
	instructions?: string;
	escalate?: boolean;
	source?: string;
}): Promise<WorkflowJob> {
	const store = getIntelligenceStore();
	const brain =
		input.brandBrainId != null
			? await store.getBrandBrainById(input.ownerUserId, input.brandBrainId)
			: await store.getBrandBrain(input.ownerUserId, input.airtableBrandId);
	if (!brain) throw new Error('Brand brain not found');

	const strategy = await store.getStrategyForBrand(input.ownerUserId, brain.id);
	if (strategy) {
		const hasMain =
			strategy.status === 'active' ||
			strategy.objectives.length > 0 ||
			strategy.contentPillars.some((p) => !`${p}`.endsWith(' content'));
		if (hasMain || strategy.draftPayload) {
			await store.snapshotStrategy(
				input.ownerUserId,
				strategy.id,
				strategyRowToSnapshotPayload(strategy),
				'pre_regenerate',
			);
		}
		await store.saveStrategyDraft(input.ownerUserId, strategy.id, strategy.draftPayload ?? null, {
			phase: 'generating',
			source: input.source ?? 'manual',
			startedAt: new Date().toISOString(),
		});
	}

	return enqueueWorkflowJob(store, input.ownerUserId, {
		jobType: 'strategy_generation',
		brandBrainId: brain.id,
		payload: {
			airtableBrandId: input.airtableBrandId,
			brandBrainId: brain.id,
			researchId: input.researchId,
			instructions: input.instructions,
			escalate: input.escalate ?? false,
			source: input.source ?? 'manual',
		} satisfies StrategyGenerationJobPayload,
	});
}

export async function runStrategyGenerationJob(job: WorkflowJob): Promise<StrategyGenerationJobResult> {
	const store = getIntelligenceStore();
	const payload = job.payload as StrategyGenerationJobPayload;
	const brain = await store.getBrandBrainById(job.userId, payload.brandBrainId ?? '');
	if (!brain) throw new Error('Brand brain not found for strategy job');

	const strategy = await store.getStrategyForBrand(job.userId, brain.id);
	if (!strategy) throw new Error('Strategy row not found');

	let research = null;
	if (payload.researchId) {
		research = await getAgentStore().getResearch(job.userId, payload.researchId);
	}

	const learnings = await store.listLearnings(job.userId, brain.id);

	const generated = await generateNativeStrategy({
		brain,
		existingStrategy: strategy,
		research,
		learnings,
		instructions: payload.instructions,
		escalate: payload.escalate,
		userId: job.userId,
	});

	await store.saveStrategyDraft(job.userId, strategy.id, generated.draft as unknown as Record<string, unknown>, {
		phase: 'ready',
		modelRole: generated.modelRole,
		model: generated.model,
		jobId: job.id,
		source: payload.source,
		completedAt: new Date().toISOString(),
	});

	return {
		draftReady: true,
		modelRole: generated.modelRole,
		model: generated.model,
	};
}

export async function dispatchStrategyGenerationWorker(jobId: string): Promise<void> {
	if (strategyGenerationRunsInline()) {
		const store = getIntelligenceStore();
		const job = (await store.claimJobById(jobId)) ?? (await store.getJobById(jobId));
		if (!job) return;
		try {
			const result = await runStrategyGenerationJob(job);
			await store.updateJob(job.id, {
				status: 'completed',
				completedAt: new Date().toISOString(),
				payload: { ...job.payload, result },
				lastError: undefined,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Strategy generation failed';
			const strategyBrainId = String((job.payload as StrategyGenerationJobPayload).brandBrainId ?? '');
			const strategy = strategyBrainId
				? await store.getStrategyForBrand(job.userId, strategyBrainId)
				: null;
			if (strategy) {
				await store.saveStrategyDraft(job.userId, strategy.id, strategy.draftPayload ?? null, {
					phase: 'failed',
					error: message,
					jobId: job.id,
					completedAt: new Date().toISOString(),
				});
			}
			await store.updateJob(job.id, {
				status: 'failed',
				completedAt: new Date().toISOString(),
				lastError: message,
			});
			throw error;
		}
		return;
	}

	const secret = process.env.INTELLIGENCE_CRON_SECRET?.trim();
	const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
	if (!secret) {
		throw new Error('INTELLIGENCE_CRON_SECRET is not configured for async strategy generation.');
	}
	const response = await fetch(`${base}/api/intelligence/jobs/process`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-cron-secret': secret,
		},
	});
	if (!response.ok) {
		const text = await response.text().catch(() => '');
		throw new Error(`Strategy generation worker dispatch failed (${response.status}): ${text.slice(0, 200)}`);
	}
}

export function publicStrategyGenerationJob(job: WorkflowJob): Record<string, unknown> {
	const payload = job.payload as StrategyGenerationJobPayload & { result?: StrategyGenerationJobResult | null };
	const result = payload.result ?? null;
	return {
		jobId: job.id,
		status: job.status,
		draftReady: result?.draftReady ?? job.status === 'completed',
		modelRole: result?.modelRole ?? null,
		model: result?.model ?? null,
		error: job.lastError ?? result?.error ?? null,
		createdAt: job.createdAt,
		startedAt: job.startedAt ?? null,
		completedAt: job.completedAt ?? null,
	};
}
