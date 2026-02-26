/**
 * Usage Increment Endpoint
 * Called by Make after content generation completes.
 *
 * Decrement timing by channel:
 *   - X export / Blog export / Blog outlines: decremented HERE (value delivered at generation)
 *   - LinkedIn autopublish (Creator+): decremented at APPROVAL time (not here)
 *   - Meta autopublish (Growth+): decremented at APPROVAL time (not here)
 *   - LinkedIn export (Starter/Trial): decremented HERE (export, value at generation)
 *
 * The `plan` parameter (passed by Make) determines which channels count now vs at approval.
 * If plan is omitted, it is resolved from the database.
 */

import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { resolvePlan } from '@/lib/planResolver';
import dayjs from 'dayjs';

export const runtime = 'nodejs';

export async function POST(req: Request) {
	try {
		const {
			userId,
			count = 1,
			generation_job_id,
			channelCounts,
			plan: planParam,
		} = await req.json();

		if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

		const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');
		const expectedKey = process.env.MAKE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
		if (expectedKey && apiKey !== expectedKey) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const supabase = getSupabaseService();

		// Idempotency check
		if (generation_job_id) {
			const { data: job } = await supabase
				.from('generation_jobs')
				.select('usage_incremented')
				.eq('generation_job_id', generation_job_id)
				.maybeSingle();

			if (job?.usage_incremented) {
				console.log('[Usage Increment] Already incremented for job:', generation_job_id);
				return NextResponse.json({ ok: true, already_incremented: true });
			}
		}

		// Resolve plan if not provided (Make should provide it, but fall back to DB lookup)
		let plan: string = planParam || 'unknown';
		if (!planParam) {
			try {
				const resolved = await resolvePlan(userId);
				plan = resolved.plan;
			} catch {
				plan = 'unknown';
			}
		}

		// Determine which channels to count at generation time
		// LinkedIn autopublish (Creator/Growth/Pro): counted at APPROVAL time — skip here
		// Meta (Growth/Pro): counted at APPROVAL time — skip here
		// Starter/Trial: LinkedIn is export-only, count at generation
		const isStarterOrTrial = plan === 'starter' || plan === 'trial' || plan === 'free';

		const linkedin = channelCounts?.LinkedIn ?? channelCounts?.linkedin ?? 0;
		const x = channelCounts?.X ?? channelCounts?.x ?? 0;
		const blog = channelCounts?.Blog ?? channelCounts?.blog ?? 0;
		const instagram = channelCounts?.Instagram ?? channelCounts?.instagram ?? 0;
		const facebook = channelCounts?.Facebook ?? channelCounts?.facebook ?? 0;
		const blogOutlines = channelCounts?.BlogOutlines ?? channelCounts?.blog_outlines ?? 0;

		// For paid plans (Creator+): LinkedIn is counted at approval, not here
		// For Starter/Trial: LinkedIn is export-only, count it here
		const linkedinToCount = isStarterOrTrial ? linkedin : 0;

		// Meta is NEVER counted here regardless of plan (always at approval)
		const instagramToCount = 0;
		const facebookToCount = 0;
		const metaPoolToCount = 0; // Always 0 here; approval route handles meta_pool_used

		const totalToCount =
			linkedinToCount + x + blog + blogOutlines + instagramToCount + facebookToCount;

		const ym = dayjs().format('YYYY-MM');
		const { data: existing } = await supabase
			.from('usage_posts')
			.select('*')
			.eq('user_id', userId)
			.eq('year_month', ym)
			.maybeSingle();

		if (existing) {
			await supabase
				.from('usage_posts')
				.update({
					posts: (existing as any).posts + totalToCount,
					linkedin_posts: ((existing as any).linkedin_posts ?? 0) + linkedinToCount,
					x_posts: ((existing as any).x_posts ?? 0) + x,
					blog_posts: ((existing as any).blog_posts ?? 0) + blog,
					instagram_posts: ((existing as any).instagram_posts ?? 0) + instagramToCount,
					facebook_posts: ((existing as any).facebook_posts ?? 0) + facebookToCount,
					meta_pool_used: ((existing as any).meta_pool_used ?? 0) + metaPoolToCount,
					blog_outlines_used: ((existing as any).blog_outlines_used ?? 0) + blogOutlines,
				})
				.eq('id', (existing as any).id);
		} else {
			await supabase.from('usage_posts').insert({
				user_id: userId,
				year_month: ym,
				posts: totalToCount,
				linkedin_posts: linkedinToCount,
				x_posts: x,
				blog_posts: blog,
				instagram_posts: instagramToCount,
				facebook_posts: facebookToCount,
				meta_pool_used: metaPoolToCount,
				blog_outlines_used: blogOutlines,
			});
		}

		// Mark job as usage-incremented to prevent double-counting
		if (generation_job_id) {
			await supabase
				.from('generation_jobs')
				.update({ usage_incremented: true })
				.eq('generation_job_id', generation_job_id);
		}

		console.log('[Usage Increment] Incremented:', {
			userId,
			plan,
			linkedinCounted: linkedinToCount,
			x,
			blog,
			blogOutlines,
			metaDeferred: instagram + facebook,
			generation_job_id,
		});
		return NextResponse.json({ ok: true });
	} catch (e: any) {
		return NextResponse.json({ error: e?.message || 'Failed to increment usage' }, { status: 500 });
	}
}
