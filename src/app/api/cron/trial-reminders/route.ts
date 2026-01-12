import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { sendEmail } from '@/lib/email/sendEmail';
import { TrialEndingEmail } from '@/emails/product/TrialEndingEmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This endpoint should be called by a cron job (Vercel Cron or external service)
// It sends two types of emails:
// 1. Reminder email 5 days before trial ends (only once)
// 2. Trial ended email when trial has expired (only once, within 24 hours of expiration)

export async function GET(req: Request) {
	try {
		// Verify this is called from a cron job
		const { searchParams } = new URL(req.url);
		const cronSecret = process.env.CRON_SECRET;
		const providedSecret = searchParams.get('secret') || req.headers.get('x-cron-secret');
		
		if (cronSecret && providedSecret !== cronSecret) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const admin = getSupabaseService();
		const now = new Date();
		const nowISO = now.toISOString();
		
		const results: any[] = [];
		const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';

		// ============================================
		// 1. Send "5 days before" reminder emails
		// ============================================
		const fiveDaysFromNow = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
		const fiveDaysMin = new Date(fiveDaysFromNow.getTime() - 12 * 60 * 60 * 1000); // 12 hours window
		const fiveDaysMax = new Date(fiveDaysFromNow.getTime() + 12 * 60 * 60 * 1000);

		const { data: reminderSubscriptions, error: reminderError } = await admin
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
			.gte('current_period_end', fiveDaysMin.toISOString())
			.lte('current_period_end', fiveDaysMax.toISOString())
			.is('trial_reminder_sent_at', null); // Only send if not already sent

		if (reminderError) {
			console.error('[Trial Reminders] Error fetching reminder subscriptions:', reminderError);
		} else if (reminderSubscriptions && reminderSubscriptions.length > 0) {
			for (const sub of reminderSubscriptions) {
				try {
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
							isTrialEnded: false,
						}),
						category: 'content',
					});

					// Mark reminder as sent
					await admin
						.from('subscriptions')
						.update({ trial_reminder_sent_at: nowISO })
						.eq('user_id', sub.user_id);

					results.push({
						userId: sub.user_id,
						email: profile.email,
						type: 'reminder',
						trialEndsDate: sub.current_period_end,
						sent: true,
					});

					console.log(`[Trial Reminders] Sent 5-day reminder to ${profile.email} (trial ends ${trialEndsDate})`);
				} catch (err: any) {
					console.error(`[Trial Reminders] Failed to send reminder to user ${sub.user_id}:`, err);
					results.push({
						userId: sub.user_id,
						email: (sub as any).profiles?.email || 'unknown',
						type: 'reminder',
						sent: false,
						error: err.message,
					});
				}
			}
		}

		// ============================================
		// 2. Send "trial ended" emails
		// ============================================
		const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const oneDayAgoISO = oneDayAgo.toISOString();

		const { data: endedSubscriptions, error: endedError } = await admin
			.from('subscriptions')
			.select(`
				*,
				profiles:user_id (
					id,
					email,
					full_name
				)
			`)
			.is('stripe_subscription_id', null) // Trial subscriptions
			.lte('current_period_end', nowISO) // Trial has ended
			.gte('current_period_end', oneDayAgoISO) // But not more than 24 hours ago
			.is('trial_ended_email_sent_at', null); // Only send if not already sent

		if (endedError) {
			console.error('[Trial Reminders] Error fetching ended subscriptions:', endedError);
		} else if (endedSubscriptions && endedSubscriptions.length > 0) {
			for (const sub of endedSubscriptions) {
				try {
					const profile = (sub as any).profiles;
					if (!profile || !profile.email) {
						console.warn(`[Trial Reminders] No email found for user ${sub.user_id}`);
						continue;
					}

					const upgradeUrl = `${appUrl}/billing?trial_ended=true`;
					const trialEndsDate = new Date(sub.current_period_end).toLocaleDateString('en-US', {
						year: 'numeric',
						month: 'long',
						day: 'numeric',
					});

					await sendEmail({
						to: profile.email,
						subject: "Your free trial has ended",
						react: TrialEndingEmail({
							upgradeUrl,
							userEmail: profile.email,
							trialEndsDate,
							isTrialEnded: true,
						}),
						category: 'content',
					});

					// Mark trial ended email as sent
					await admin
						.from('subscriptions')
						.update({ trial_ended_email_sent_at: nowISO })
						.eq('user_id', sub.user_id);

					results.push({
						userId: sub.user_id,
						email: profile.email,
						type: 'ended',
						trialEndsDate: sub.current_period_end,
						sent: true,
					});

					console.log(`[Trial Reminders] Sent trial ended email to ${profile.email} (trial ended ${trialEndsDate})`);
				} catch (err: any) {
					console.error(`[Trial Reminders] Failed to send trial ended email to user ${sub.user_id}:`, err);
					results.push({
						userId: sub.user_id,
						email: (sub as any).profiles?.email || 'unknown',
						type: 'ended',
						sent: false,
						error: err.message,
					});
				}
			}
		}

		const sentCount = results.filter(r => r.sent).length;
		const failedCount = results.filter(r => !r.sent).length;
		const reminderCount = results.filter(r => r.type === 'reminder' && r.sent).length;
		const endedCount = results.filter(r => r.type === 'ended' && r.sent).length;

		return NextResponse.json({
			message: `Processed trial reminder emails`,
			sent: sentCount,
			failed: failedCount,
			reminders: reminderCount,
			ended: endedCount,
			results,
		});
	} catch (e: any) {
		console.error('[Trial Reminders] Error:', e);
		return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
	}
}
