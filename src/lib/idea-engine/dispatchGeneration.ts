import 'server-only';

import { after } from 'next/server';
import { generateChannelsForRun } from './generator/generateSeries';
import { logIdeaEngineLifecycle } from './observability/lifecycle';
import { markRunGenerationStarted } from './persistence/generationStage';
import { markRunFailed } from './persistence/applyGeneratedItems';

export function resolveIdeaEngineAppBaseUrl(): string {
	const site = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
	if (site) return site.replace(/\/$/, '');
	if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
	return 'http://localhost:3000';
}

export function resolveIdeaEngineExecuteSecret(): string | undefined {
	return (
		process.env.IDEA_ENGINE_EXECUTE_SECRET?.trim() ||
		process.env.CRON_SECRET?.trim() ||
		undefined
	);
}

function runGenerationInline(runId: string, channels?: string[]): void {
	after(async () => {
		logIdeaEngineLifecycle('after_job_started', runId, { mode: 'inline_after' });
		try {
			await generateChannelsForRun(runId, channels);
		} catch (err) {
			console.error('[IdeaEngine/Lifecycle] inline generation failed', {
				run_id: runId,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	});
}

/**
 * Starts native generation in a separate serverless invocation when possible.
 * Falls back to after() only when no execute secret / base URL is configured (local dev).
 */
export async function dispatchGenerationJob(options: {
	runId: string;
	channels?: string[];
}): Promise<void> {
	const { runId, channels } = options;
	await markRunGenerationStarted(runId);
	logIdeaEngineLifecycle('after_job_started', runId, {
		channels: channels?.join(',') || 'all',
	});

	const secret = resolveIdeaEngineExecuteSecret();
	const baseUrl = resolveIdeaEngineAppBaseUrl();

	if (!secret) {
		console.warn('[IdeaEngine/Lifecycle] No execute secret — using after() fallback', {
			run_id: runId,
		});
		runGenerationInline(runId, channels);
		return;
	}

	const executeUrl = `${baseUrl}/api/idea-engine/run/${runId}/execute`;

	try {
		const response = await fetch(executeUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-idea-engine-execute-secret': secret,
			},
			body: JSON.stringify({ channels }),
			signal: AbortSignal.timeout(15_000),
		});

		if (!response.ok) {
			const body = await response.text().catch(() => '');
			logIdeaEngineLifecycle('execute_dispatch_failed', runId, {
				status: response.status,
				body: body.slice(0, 500),
			});
			runGenerationInline(runId, channels);
			return;
		}

		logIdeaEngineLifecycle('execute_dispatched', runId, { execute_url: executeUrl });
	} catch (error) {
		logIdeaEngineLifecycle('execute_dispatch_failed', runId, {
			error: error instanceof Error ? error.message : String(error),
		});
		runGenerationInline(runId, channels);
	}
}

export async function dispatchGenerationJobOrFail(options: {
	runId: string;
	channels?: string[];
}): Promise<void> {
	try {
		await dispatchGenerationJob(options);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to start generation';
		logIdeaEngineLifecycle('run_marked_failed', options.runId, { reason: 'dispatch_error', message });
		await markRunFailed(options.runId, message);
		throw error;
	}
}
