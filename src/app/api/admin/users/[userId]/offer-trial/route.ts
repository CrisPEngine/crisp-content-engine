import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { z } from 'zod';

export const runtime = 'nodejs';

const offerTrialSchema = z.object({
	plan: z.enum(['creator', 'growth', 'pro', 'scale']),
	cycle: z.enum(['monthly', 'annual']),
	trialDays: z.number().int().min(1).max(365).default(30), // Free access period in days
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

export async function POST(
	req: Request,
	{ params }: { params: Promise<{ userId: string }> }
) {
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

		const admin = getSupabaseService();
		const { userId } = await params;
		const body = await req.json();
		const validated = offerTrialSchema.parse(body);
		const { plan, cycle, trialDays } = validated;

		// Get auth user info
		let authUser: any = null;
		try {
			const authResult = await admin.auth.admin.getUserById(userId);
			authUser = authResult.data;
		} catch (error) {
			return NextResponse.json({ 
				error: 'User not found in auth system' 
			}, { status: 404 });
		}

		if (!authUser?.user) {
			return NextResponse.json({ 
				error: 'User not found in auth system' 
			}, { status: 404 });
		}

		const userEmail = authUser.user.email || authUser.user.user_metadata?.email;
		if (!userEmail) {
			return NextResponse.json({ 
				error: 'User email not found' 
			}, { status: 400 });
		}

		// Check if profile already exists
		const { data: existingProfile } = await admin
			.from('profiles')
			.select('id, email')
			.eq('id', userId)
			.maybeSingle();

		// Create profile if it doesn't exist
		if (!existingProfile) {
			await admin.from('profiles').insert({
				id: userId,
				email: userEmail,
				full_name: authUser.user.user_metadata?.full_name || null,
				is_admin: false,
			});
			console.log(`[Offer Trial] Created profile for user ${userId}`);
		}

		// Check if subscription already exists
		const { data: existingSubscription } = await admin
			.from('subscriptions')
			.select('*')
			.eq('user_id', userId)
			.maybeSingle();

		if (existingSubscription) {
			return NextResponse.json({ 
				error: 'User already has a subscription. Use the "Set Plan" feature to modify it.',
				existingSubscription 
			}, { status: 400 });
		}

		// Calculate trial expiration date (in seconds since epoch for current_period_end)
		const now = new Date();
		const trialExpiresAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
		const currentPeriodEnd = Math.floor(trialExpiresAt.getTime() / 1000);

		// Create subscription and entitlements using the billing function
		const { upsertSubscriptionAndEntitlements } = await import('@/lib/billing');
		await upsertSubscriptionAndEntitlements({
			userId,
			plan,
			cycle,
			currentPeriodEnd,
		});

		console.log(`[Offer Trial] Created trial subscription for user ${userId}: ${plan} (${cycle}) for ${trialDays} days`);

		// Send invite email via Resend
		try {
			const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io'}/auth/callback`;
			
			// Generate invite link using Supabase admin API
			const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
				type: 'recovery', // Use recovery type for password reset/invite
				email: userEmail,
				options: {
					redirectTo: redirectUrl,
				},
			});

			if (linkError || !linkData) {
				console.error('Failed to generate invite link:', linkError);
			} else {
				// Extract the action link
				const inviteUrl = linkData.properties?.action_link || linkData.properties?.hashed_token 
					? `${redirectUrl}?token_hash=${linkData.properties.hashed_token}&type=recovery`
					: null;

				if (inviteUrl) {
					const { sendEmail } = await import('@/lib/email/sendEmail');
					const { AuthInviteEmail } = await import('@/emails/auth/AuthInviteEmail');

					await sendEmail({
						to: userEmail,
						subject: `You've been invited to try CRISP Content Engine - ${trialDays} day free trial!`,
						react: AuthInviteEmail({ 
							inviteUrl, 
							userEmail,
							trialDays,
							plan: `${plan.charAt(0).toUpperCase() + plan.slice(1)} (${cycle})`,
						}),
						category: 'auth',
					});

					console.log('Trial invite email sent successfully:', { email: userEmail, userId });
				} else {
					console.error('No action link in generated invite link data:', linkData);
				}
			}
		} catch (err: any) {
			console.error('Error sending trial invite email:', {
				error: err,
				message: err?.message,
				email: userEmail,
				userId,
				note: 'Trial subscription created but invite email failed. User can use password reset to set their password.',
			});
		}

		return NextResponse.json({ 
			success: true,
			userId,
			email: userEmail,
			plan,
			cycle,
			trialDays,
			trialExpiresAt: trialExpiresAt.toISOString(),
			message: `Free trial offered successfully! ${trialDays}-day trial expires on ${trialExpiresAt.toLocaleDateString()}. Invite email sent.`,
		});
	} catch (e: any) {
		if (e instanceof z.ZodError) {
			return NextResponse.json({ 
				error: 'Validation error',
				details: e.issues 
			}, { status: 400 });
		}
		console.error('[Offer Trial] Error:', e);
		return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
	}
}
