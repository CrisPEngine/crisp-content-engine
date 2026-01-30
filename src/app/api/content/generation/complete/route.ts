/**
 * Make.com completion callback for multi-channel generation
 * 
 * Called by Make after creating ContentQueue records.
 * Updates generation_jobs table and increments usage (idempotent).
 * 
 * Auth: x-make-secret header
 */

import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const completionSchema = z.object({
	generation_job_id: z.string().uuid(),
	created: z.record(z.number()), // { "LinkedIn": 3, "X": 10, ... }
	record_ids: z.array(z.string()),
});

export async function POST(req: Request) {
	try {
		// Validate auth
		const secret = req.headers.get('x-make-secret');
		const expectedSecret = process.env.MAKE_SHARED_SECRET;

		if (expectedSecret && secret !== expectedSecret) {
			console.error('[Generation Complete] Invalid secret');
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Parse and validate payload
		const body = await req.json();
		const parseResult = completionSchema.safeParse(body);

		if (!parseResult.success) {
			console.error('[Generation Complete] Invalid payload:', parseResult.error.issues);
			return NextResponse.json(
				{ error: 'Invalid request body', details: parseResult.error.issues },
				{ status: 400 }
			);
		}

		const { generation_job_id, created, record_ids } = parseResult.data;

		console.log('[Generation Complete] Processing:', {
			generation_job_id,
			created,
			record_count: record_ids.length,
		});

		const admin = getSupabaseService();

		// Load generation job
		const { data: job, error: jobError } = await admin
			.from('generation_jobs')
			.select('*')
			.eq('generation_job_id', generation_job_id)
			.maybeSingle();

		if (jobError || !job) {
			console.error('[Generation Complete] Job not found:', generation_job_id);
			return NextResponse.json(
				{ error: 'Generation job not found' },
				{ status: 404 }
			);
		}

		// Calculate total created count
		const totalCreated = Object.values(created).reduce((sum, count) => sum + count, 0);

		// Update generation job
		await admin
			.from('generation_jobs')
			.update({
				created_count: totalCreated,
				completed_at: new Date().toISOString(),
			})
			.eq('generation_job_id', generation_job_id);

		// Increment usage (idempotent via usage_incremented flag)
		if (!job.usage_incremented && totalCreated > 0) {
			// Call usage increment endpoint (which handles idempotency internally)
			const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
			const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';

			try {
				await fetch(`${appUrl}/api/usage/increment`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(apiKey && { 'x-api-key': apiKey }),
					},
					body: JSON.stringify({
						userId: job.user_id,
						count: totalCreated,
						generation_job_id, // For idempotency
					}),
				});

				// Mark as incremented
				await admin
					.from('generation_jobs')
					.update({ usage_incremented: true })
					.eq('generation_job_id', generation_job_id);

				console.log('[Generation Complete] Usage incremented:', {
					user_id: job.user_id,
					count: totalCreated,
				});
			} catch (usageError) {
				console.error('[Generation Complete] Failed to increment usage:', usageError);
				// Don't fail the whole request if usage increment fails
			}
		}

		return NextResponse.json({
			ok: true,
			generation_job_id,
			created_count: totalCreated,
			usage_incremented: true,
		});
	} catch (error: any) {
		console.error('[Generation Complete] Error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Internal server error' },
			{ status: 500 }
		);
	}
}

// Handle invalid methods
export async function GET() {
	return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT() {
	return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
	return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
