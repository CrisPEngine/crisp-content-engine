import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { capsFor } from '@/lib/billing';
import { z } from 'zod';

export const runtime = 'nodejs';

const createUserSchema = z.object({
	email: z.string().email('Invalid email address'),
	plan: z.enum(['creator', 'growth', 'pro', 'scale']),
	cycle: z.enum(['monthly', 'annual']),
	trialDays: z.number().int().min(0).max(365).default(0), // Free access period in days
});

async function checkAdmin(userId: string) {
	const admin = getSupabaseService();
	const { data: profile } = await admin
		.from('profiles')
		.select('is_admin')
		.eq('id', userId)
		.single();
	return profile?.is_admin === true;
}

export async function POST(req: Request) {
	try {
		const supabase = await createClient();
		const { data: { user } } = await supabase.auth.getUser();
		
		if (!user) {
			return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
		}

		const isAdmin = await checkAdmin(user.id);
		if (!isAdmin) {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
		}

		const body = await req.json();
		const validated = createUserSchema.parse(body);
		const { email, plan, cycle, trialDays } = validated;

		const admin = getSupabaseService();

		// Check if user already exists
		const { data: existingProfile } = await admin
			.from('profiles')
			.select('id, email')
			.eq('email', email)
			.maybeSingle();

		if (existingProfile) {
			return NextResponse.json({ 
				error: 'User with this email already exists',
				userId: existingProfile.id 
			}, { status: 400 });
		}

		// Create user in Supabase Auth using admin API
		// Generate a random password (user will need to reset it)
		const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12) + 'A1!';
		
		const { data: authUser, error: authError } = await admin.auth.admin.createUser({
			email,
			email_confirm: true, // Auto-confirm email
			password: randomPassword,
		});

		if (authError || !authUser.user) {
			console.error('Error creating auth user:', authError);
			return NextResponse.json({ 
				error: authError?.message || 'Failed to create user in authentication system' 
			}, { status: 500 });
		}

		const userId = authUser.user.id;

		// Create profile
		await admin.from('profiles').insert({
			id: userId,
			email,
			full_name: null,
			is_admin: false,
		});

		// Calculate trial expiration date (in seconds since epoch for current_period_end)
		const now = new Date();
		const trialExpiresAt = trialDays > 0 
			? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)
			: null;
		const currentPeriodEnd = trialExpiresAt ? Math.floor(trialExpiresAt.getTime() / 1000) : undefined;

		// Create subscription and entitlements using the billing function
		const { upsertSubscriptionAndEntitlements } = await import('@/lib/billing');
		await upsertSubscriptionAndEntitlements({
			userId,
			plan,
			cycle,
			currentPeriodEnd,
		});

		// Send password reset email so user can set their own password
		// Note: Supabase admin API doesn't have generateLink, we'll use inviteUser instead
		// or send a recovery email
		try {
			const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
				redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io'}/auth/callback`,
			});

			if (inviteError) {
				console.warn('Failed to send invite email:', inviteError);
				// Don't fail the request, but log it
			}
		} catch (err: any) {
			console.warn('Error sending invite email:', err);
		}

		return NextResponse.json({ 
			success: true,
			userId,
			email,
			plan,
			cycle,
			trialDays,
			trialExpiresAt: trialExpiresAt?.toISOString(),
			message: `User created successfully. ${trialDays > 0 ? `Free access expires on ${trialExpiresAt?.toLocaleDateString()}.` : ''} Password reset email sent.`,
		});
	} catch (e: any) {
		if (e instanceof z.ZodError) {
			return NextResponse.json({ 
				error: 'Validation error',
				details: e.issues 
			}, { status: 400 });
		}
		return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
	}
}

