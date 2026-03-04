/**
 * POST /api/content/generation/progress
 * 
 * Progress callback from Make.com for multi-channel generation.
 * Each route (LinkedIn, X, Instagram, Facebook, Blog) reports completion.
 * 
 * When all expected platforms have reported, mark the job complete.
 */

import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const progressSchema = z.object({
	generation_job_id: z.string().min(1),
	platform: z.enum(['LinkedIn', 'X', 'Instagram', 'Facebook', 'Blog']),
	route_status: z.enum(['completed', 'failed']),
	created_count: z.number().int().min(0),
	record_ids: z.array(z.string()),
	// Optional fields
	request_id: z.string().optional(),
	user_id: z.string().optional(),
	brand_profile_id: z.string().optional(),
	errors: z.array(z.unknown()).optional().default([]),
	skipped_count: z.number().int().min(0).optional().default(0),
	reported_at: z.string().optional(),
});

export async function POST(req: Request) {
	try {
		// 1. Auth: Verify x-make-secret
		const secret = req.headers.get('x-make-secret');
		const expectedSecret = process.env.MAKE_SHARED_SECRET;
		
		if (!expectedSecret) {
			console.error('[Generation Progress] MAKE_SHARED_SECRET not configured');
			return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
		}
		
		if (secret !== expectedSecret) {
			console.warn('[Generation Progress] Invalid secret');
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// 2. Parse and validate payload
		const body = await req.json().catch(() => ({}));
		const parseResult = progressSchema.safeParse(body);
		
		if (!parseResult.success) {
			console.error('[Generation Progress] Validation failed:', parseResult.error.issues);
			return NextResponse.json(
				{ error: 'Invalid request body', details: parseResult.error.issues },
				{ status: 400 }
			);
		}
		
		const {
			generation_job_id,
			platform,
			route_status,
			created_count,
			record_ids,
			errors,
			skipped_count,
			reported_at,
		} = parseResult.data;

		console.log('[Generation Progress] Received:', {
			generation_job_id,
			platform,
			route_status,
			created_count,
			record_ids_count: record_ids.length,
			skipped_count,
		});

		const admin = getSupabaseService();

		// 3. Fetch the generation job to get expected_platforms
		const { data: job, error: jobFetchError } = await admin
			.from('generation_jobs')
			.select('id, generation_job_id, user_id, expected_platforms, completed_platforms, status, created_counts, record_ids, usage_incremented')
			.eq('generation_job_id', generation_job_id)
			.maybeSingle();

		if (jobFetchError || !job) {
			console.error('[Generation Progress] Job not found:', jobFetchError);
			return NextResponse.json(
				{ error: `Generation job not found: ${generation_job_id}` },
				{ status: 404 }
			);
		}

		const expectedPlatforms = (job.expected_platforms as string[]) || [];
		let completedPlatforms = (job.completed_platforms as string[]) || [];
		const createdCounts = (job.created_counts as Record<string, number>) || {};
		const recordIdsMap = (job.record_ids as Record<string, string[]>) || {};

		// 4. Upsert progress row (idempotent)
		// On conflict: merge record_ids (union), update counts, update timestamps
		const { data: existingProgress } = await admin
			.from('generation_job_progress')
			.select('record_ids')
			.eq('generation_job_id', generation_job_id)
			.eq('platform', platform)
			.maybeSingle();

		// Merge record_ids: union existing + new
		const existingRecordIds = (existingProgress?.record_ids as string[]) || [];
		const mergedRecordIds = Array.from(new Set([...existingRecordIds, ...record_ids]));

		const { error: progressError } = await admin
			.from('generation_job_progress')
			.upsert(
				{
					generation_job_id,
					platform,
					route_status,
					created_count: mergedRecordIds.length, // Use merged count for accuracy
					record_ids: mergedRecordIds,
					skipped_count,
					errors: errors || [],
					reported_at: reported_at ? new Date(reported_at).toISOString() : new Date().toISOString(),
				},
				{
					onConflict: 'generation_job_id,platform',
				}
			);

		if (progressError) {
			console.error('[Generation Progress] Failed to upsert progress:', progressError);
			return NextResponse.json(
				{ error: 'Failed to record progress' },
				{ status: 500 }
			);
		}

		// 5. Add platform to completed_platforms if not already present
		if (!completedPlatforms.includes(platform)) {
			completedPlatforms = [...completedPlatforms, platform];
		}

		// Update created_counts and record_ids map
		createdCounts[platform] = mergedRecordIds.length;
		recordIdsMap[platform] = mergedRecordIds;

		// 6. Determine if job is complete
		// Job is complete when all expected platforms have reported (in progress table or completed_platforms)
		const { data: allProgress } = await admin
			.from('generation_job_progress')
			.select('platform, route_status')
			.eq('generation_job_id', generation_job_id);

		const reportedPlatforms = new Set((allProgress || []).map((p) => p.platform));
		const allExpectedReported = expectedPlatforms.every((p) => reportedPlatforms.has(p));

		let jobStatus = job.status || 'in_progress';
		let completedAt: string | null = null;

		if (allExpectedReported) {
			// Check if all completed or mix of completed/failed
			const allStatuses = (allProgress || []).map((p) => p.route_status);
			const allCompleted = allStatuses.every((s) => s === 'completed');
			const allFailed = allStatuses.every((s) => s === 'failed');

			if (allCompleted) {
				jobStatus = 'completed';
				completedAt = new Date().toISOString();
			} else if (allFailed) {
				jobStatus = 'failed';
				completedAt = new Date().toISOString();
			} else {
				jobStatus = 'partial';
				completedAt = new Date().toISOString();
			}
		} else {
			jobStatus = 'in_progress';
		}

		// 7. Update generation_jobs with progress
		const updatePayload: Record<string, unknown> = {
			completed_platforms: completedPlatforms,
			status: jobStatus,
			created_counts: createdCounts,
			record_ids: recordIdsMap,
			last_progress_at: new Date().toISOString(),
		};

		if (completedAt) {
			updatePayload.completed_at = completedAt;
		}

		const { error: jobUpdateError } = await admin
			.from('generation_jobs')
			.update(updatePayload)
			.eq('generation_job_id', generation_job_id);

		if (jobUpdateError) {
			console.error('[Generation Progress] Failed to update job:', jobUpdateError);
			// Don't fail the request; progress was recorded
		}

		// When all platforms have reported and job is completed, trigger usage increment if Make did not call /complete
		const totalCreated = Object.values(createdCounts).reduce((sum, n) => sum + n, 0);
		if (
			allExpectedReported &&
			(jobStatus === 'completed' || jobStatus === 'partial') &&
			totalCreated > 0 &&
			!job.usage_incremented
		) {
			// createdCounts already has keys LinkedIn, X, Blog (from platform enum)
			const channelCounts = { ...createdCounts };
			const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.MAKE_API_KEY;
			const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://app.crispdigital.io';
			try {
				const incRes = await fetch(`${appUrl}/api/usage/increment`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(apiKey && { 'x-api-key': apiKey }),
					},
					body: JSON.stringify({
						userId: job.user_id,
						count: totalCreated,
						channelCounts,
						generation_job_id,
					}),
				});
				if (incRes.ok) {
					await admin
						.from('generation_jobs')
						.update({ usage_incremented: true })
						.eq('generation_job_id', generation_job_id);
					console.log('[Generation Progress] Usage incremented (fallback):', { generation_job_id, totalCreated, channelCounts });
				}
			} catch (usageErr) {
				console.error('[Generation Progress] Usage increment fallback failed:', usageErr);
			}
		}

		console.log('[Generation Progress] Updated:', {
			generation_job_id,
			platform,
			job_status: jobStatus,
			completed_platforms: completedPlatforms,
			all_expected_reported: allExpectedReported,
		});

		// 8. Return response
		return NextResponse.json({
			ok: true,
			generation_job_id,
			platform,
			job_status: jobStatus,
			completed_platforms: completedPlatforms,
		});
	} catch (error: any) {
		console.error('[Generation Progress] Error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Failed to record progress' },
			{ status: 500 }
		);
	}
}
