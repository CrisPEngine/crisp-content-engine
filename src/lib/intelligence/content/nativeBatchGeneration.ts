import 'server-only';

import { randomUUID } from 'crypto';
import { getSupabaseService } from '@/lib/supabaseService';
import { getIntelligenceStore } from '../actions';
import { runContentIntelligencePipeline } from '../pipeline';
import { assertStrategyReadyForContent } from '../strategy/strategyCompleteness';
import type { ContentType } from '../types';

export type NativeBatchChannel = {
	platform: 'LinkedIn' | 'X' | 'Instagram' | 'Facebook' | 'Blog';
	count: number;
};

function platformToChannel(platform: NativeBatchChannel['platform']): string {
	switch (platform) {
		case 'LinkedIn':
			return 'linkedin';
		case 'X':
			return 'x';
		case 'Instagram':
			return 'instagram';
		case 'Facebook':
			return 'facebook';
		case 'Blog':
			return 'blog';
	}
	return 'linkedin';
}

function contentTypeForChannel(channel: string): ContentType {
	if (channel === 'blog') return 'article';
	if (channel === 'linkedin') return 'company_post';
	return 'founder_post';
}

export function nativeBatchRunsInline(): boolean {
	if (process.env.CONTENT_GENERATION_INLINE === 'true') return true;
	if (process.env.NODE_ENV === 'test') return true;
	return false;
}

export async function createNativeGenerationJob(input: {
	userId: string;
	brandProfileId: string;
	channels: NativeBatchChannel[];
}): Promise<{ generation_job_id: string; channelsWithKeys: Array<{ platform: string; count: number; keys: string[] }> }> {
	const generation_job_id = randomUUID();
	const channelsWithKeys = input.channels.map((ch) => {
		const keys: string[] = [];
		for (let i = 1; i <= ch.count; i += 1) {
			keys.push(`${generation_job_id}:${ch.platform}:${i}`);
		}
		return { platform: ch.platform, count: ch.count, keys };
	});
	const requested_count = input.channels.reduce((sum, ch) => sum + ch.count, 0);
	const admin = getSupabaseService();
	await admin.from('generation_jobs').insert({
		generation_job_id,
		user_id: input.userId,
		brand_profile_id: input.brandProfileId,
		channels: JSON.stringify(channelsWithKeys),
		requested_count,
		expected_platforms: channelsWithKeys.map((ch) => ch.platform),
		completed_platforms: [],
		status: 'in_progress',
		created_counts: {},
		record_ids: {},
		engine: 'native',
	});
	return { generation_job_id, channelsWithKeys };
}

export async function runNativeContentBatch(generationJobId: string): Promise<void> {
	const admin = getSupabaseService();
	const { data: job, error } = await admin
		.from('generation_jobs')
		.select('*')
		.eq('generation_job_id', generationJobId)
		.maybeSingle();
	if (error || !job) throw new Error('Generation job not found');

	const store = getIntelligenceStore();
	const userId = String(job.user_id);
	const brandProfileId = String(job.brand_profile_id);
	const brain = await store.getBrandBrain(userId, brandProfileId);
	if (!brain) throw new Error('Brand brain not found');

	const strategy = await store.getStrategyForBrand(userId, brain.id);
	const gate = assertStrategyReadyForContent(strategy);
	if (!gate.ok) {
		await admin
			.from('generation_jobs')
			.update({
				status: 'failed',
				error_message: gate.message,
				completed_at: new Date().toISOString(),
			})
			.eq('generation_job_id', generationJobId);
		throw new Error(gate.message);
	}

	const channelsRaw = typeof job.channels === 'string' ? JSON.parse(job.channels) : job.channels;
	const channels: Array<{ platform: NativeBatchChannel['platform']; count: number; keys: string[] }> = channelsRaw ?? [];

	const createdCounts: Record<string, number> = {};
	const recordIds: Record<string, string[]> = {};
	const errors: string[] = [];
	const resolvedModels: string[] = [];

	for (const channelRow of channels) {
		const platform = channelRow.platform;
		const channel = platformToChannel(platform);
		const memoryIds: string[] = [];
		let platformCreated = 0;

		for (let index = 0; index < channelRow.count; index += 1) {
			const key = channelRow.keys[index] ?? `${generationJobId}:${platform}:${index + 1}`;
			try {
				const result = await runContentIntelligencePipeline(store, {
					userId,
					airtableBrandId: brandProfileId,
					userIntent: `Quick generate ${platform} post ${index + 1} aligned with the active brand strategy and editorial themes. Job key: ${key}`,
					channel,
					contentType: contentTypeForChannel(channel),
					optimizationObjective: 'authority',
				});
				for (const call of result.usage) {
					if (call.model) resolvedModels.push(call.model);
				}
				memoryIds.push(result.memory.id);
				platformCreated += 1;
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Generation failed';
				errors.push(`${platform} #${index + 1}: ${message}`);
			}
		}

		createdCounts[platform] = platformCreated;
		recordIds[platform] = memoryIds;

		const completedPlatforms = Object.keys(createdCounts);
		await admin
			.from('generation_jobs')
			.update({
				created_counts: createdCounts,
				record_ids: recordIds,
				completed_platforms: completedPlatforms,
				last_progress_at: new Date().toISOString(),
				resolved_models: resolvedModels,
			})
			.eq('generation_job_id', generationJobId);
	}

	const requested = Number(job.requested_count ?? 0);
	const createdTotal = Object.values(createdCounts).reduce((sum, n) => sum + n, 0);
	const status =
		createdTotal === 0 ? 'failed' : createdTotal < requested || errors.length > 0 ? 'partial' : 'completed';

	await admin
		.from('generation_jobs')
		.update({
			status,
			created_count: createdTotal,
			error_message: errors.length ? errors.slice(0, 8).join(' | ') : null,
			completed_at: new Date().toISOString(),
			last_progress_at: new Date().toISOString(),
		})
		.eq('generation_job_id', generationJobId);

	if (status === 'failed') {
		throw new Error(errors[0] ?? 'Native content generation produced no drafts');
	}
}

export async function dispatchNativeContentBatchWorker(generationJobId: string): Promise<void> {
	if (nativeBatchRunsInline()) {
		await runNativeContentBatch(generationJobId);
		return;
	}

	const secret = process.env.INTELLIGENCE_CRON_SECRET?.trim();
	const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
	if (!secret) {
		throw new Error('INTELLIGENCE_CRON_SECRET is not configured for async native content generation.');
	}
	const response = await fetch(`${base}/api/content/generation/run-native`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-cron-secret': secret,
		},
		body: JSON.stringify({ generation_job_id: generationJobId }),
	});
	if (!response.ok) {
		const text = await response.text().catch(() => '');
		throw new Error(`Native content worker dispatch failed (${response.status}): ${text.slice(0, 200)}`);
	}
}

export type GenerationJobPublicStatus = {
	generation_job_id: string;
	status: string;
	requested_count: number;
	created_count: number;
	created_counts: Record<string, number>;
	record_ids: Record<string, string[]>;
	error_message?: string | null;
	completed_at?: string | null;
	engine?: string | null;
};

export async function getGenerationJobStatusForUser(
	userId: string,
	generationJobId: string,
): Promise<GenerationJobPublicStatus | null> {
	const admin = getSupabaseService();
	const { data: job } = await admin
		.from('generation_jobs')
		.select(
			'generation_job_id, status, requested_count, created_count, created_counts, record_ids, error_message, completed_at, engine',
		)
		.eq('generation_job_id', generationJobId)
		.eq('user_id', userId)
		.maybeSingle();
	if (!job) return null;
	return {
		generation_job_id: String(job.generation_job_id),
		status: String(job.status ?? 'pending'),
		requested_count: Number(job.requested_count ?? 0),
		created_count: Number(job.created_count ?? 0),
		created_counts: (job.created_counts as Record<string, number>) ?? {},
		record_ids: (job.record_ids as Record<string, string[]>) ?? {},
		error_message: job.error_message ?? null,
		completed_at: job.completed_at ?? null,
		engine: job.engine ?? null,
	};
}
