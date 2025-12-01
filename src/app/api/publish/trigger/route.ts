/**
 * Trigger Publishing Job (Admin Only)
 * 
 * This endpoint allows admins to manually trigger the LinkedIn publishing job
 * to publish posts that are "Ready To Publish" and have scheduled_time in the past.
 * 
 * Security: Requires admin authentication
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

// Import the publishDueContent function directly
// We need to duplicate the logic or export it from linkedin-due
// For now, let's call the endpoint with the cron secret
async function triggerPublishingJob(): Promise<{
	processed: number;
	success: number;
	failed: number;
	errors: string[];
}> {
	const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
	const cronSecret = process.env.CRON_SECRET;
	
	if (!cronSecret) {
		throw new Error('CRON_SECRET not configured');
	}
	
	const response = await fetch(`${baseUrl}/api/publish/linkedin-due`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			'x-cron-secret': cronSecret,
		},
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ error: 'Unknown error' }));
		throw new Error(error.error || `Failed to trigger publishing job: ${response.status}`);
	}

	return await response.json();
}

export async function POST(request: Request) {
	try {
		// Authenticate user
		const cookieStore = await cookies();
		const supabase = createServerClient(
			process.env.NEXT_PUBLIC_SUPABASE_URL!,
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
			{
				cookies: {
					get(name: string) {
						return cookieStore.get(name)?.value;
					},
					set(name: string, value: string, options: CookieOptions) {
						cookieStore.set({ name, value, ...options });
					},
					remove(name: string, options: CookieOptions) {
						cookieStore.set({ name, value: '', ...options });
					},
				},
			}
		);

		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();

		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Check if user is admin
		const admin = getSupabaseService();
		const { data: profile } = await admin
			.from('profiles')
			.select('is_admin')
			.eq('id', user.id)
			.maybeSingle();

		if (!profile?.is_admin) {
			return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
		}

		// Trigger the publishing job
		const stats = await triggerPublishingJob();

		return NextResponse.json({
			ok: true,
			message: 'Publishing job triggered successfully',
			...stats,
		});
	} catch (error: any) {
		console.error('Trigger publishing job error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}

