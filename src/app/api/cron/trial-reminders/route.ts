import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { sendEmail } from '@/lib/email/sendEmail';
import { TrialEndingEmail } from '@/emails/product/TrialEndingEmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This endpoint should be called by a cron job (Vercel Cron or external service)
// It checks for trials ending in 7 days and sends reminder emails

export async function GET(req: Request) {
	try {
		// Verify this is called from a cron job (optional: add secret header check)
		const authHeader = req.headers.get('authorization');
		const cronSecret = process.env.CRON_SECRET;
		
		if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const admin = getSupabaseService();
		const now = new Date();
		const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

		// Find subscriptions ending in 7 days (trial subscriptions don't have stripe_subscription_id)
		// We check for subscriptions with current_period_end between now and 7 days from now
		// and no stripe_subscription_id (indicating it's a trial)
		const { data: subscriptions, error } = await admin
			.from('subscriptions')
			.select(`
				*,
				profiles:user_id (
					id,
					email,
					full_name
				)
			`)
			.is('stripe_subscription_id', null) // Trial subscriptions don't have Stripe subscription
			.gte('current_period_end', now.toISOString())
			.lte('current_period_end', sevenDaysFromNow.toISOString());

		if (error) {
			console.error('[Trial Reminders] Error fetching subscriptions:', error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		if (!subscriptions || subscriptions.length === 0) {
			return NextResponse.json({ 
				message: 'No trials ending in 7 days',
				count: 0 
			});
		}

		const results = [];
		const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';

		for (const sub of subscriptions) {
			try {
				// Get user email from profile
				const profile = (sub as any).profiles;
				if (!profile || !profile.email) {
					console.warn(`[Trial Reminders] No email found for user ${sub.user_id}`);
					continue;
				}

				const upgradeUrl = `${appUrl}/billing?trial_ending=true`;
				const trialEndsDate = new Date(sub.current_period_end).toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'long',
					day: 'numeric',
				});

				await sendEmail({
					to: profile.email,
					subject: "Your content pipeline doesn't have to stop here",
					react: TrialEndingEmail({
						upgradeUrl,
						userEmail: profile.email,
						trialEndsDate,
					}),
					category: 'product',
				});

				results.push({
					userId: sub.user_id,
					email: profile.email,
					trialEndsDate: sub.current_period_end,
					sent: true,
				});

				console.log(`[Trial Reminders] Sent reminder to ${profile.email} (trial ends ${trialEndsDate})`);
			} catch (err: any) {
				console.error(`[Trial Reminders] Failed to send email to user ${sub.user_id}:`, err);
				results.push({
					userId: sub.user_id,
					email: (sub as any).profiles?.email || 'unknown',
					sent: false,
					error: err.message,
				});
			}
		}

		return NextResponse.json({
			message: `Processed ${subscriptions.length} trials ending in 7 days`,
			sent: results.filter(r => r.sent).length,
			failed: results.filter(r => !r.sent).length,
			results,
		});
	} catch (e: any) {
		console.error('[Trial Reminders] Error:', e);
		return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
	}
}
