/**
 * Strategy Reminder Email Job
 * 
 * Runs daily to send strategy reminder emails to users whose billing period is ending soon.
 * 
 * Security: Requires X-Cron-Secret header matching CRON_SECRET env variable
 * 
 * Logic:
 * 1. For each active Creator plan user (or all plans if needed)
 * 2. Check their current billing cycle end date (from Stripe or Supabase)
 * 3. If now is within 5-7 days before period end and strategy not yet confirmed:
 *    - Send StrategyReminderEmail once
 *    - Persist strategy_reminder_sent_for_period flag
 * 4. If no response by cutoff date, auto-continue with existing strategy
 */

import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { sendEmail } from '@/lib/email/sendEmail';
import { StrategyReminderEmail } from '@/emails/product/StrategyReminderEmail';
import { generateEmailActionUrl } from '@/lib/email/tokenSigning';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

const FIRST_REMINDER_DAYS = 7; // Send first reminder 7 days before period end
const FINAL_REMINDER_DAYS = 2; // Send final reminder 2 days before period end
const AUTO_CONTINUE_DAYS = 1; // Auto-continue 1 day before period end

export async function POST(request: Request) {
	try {
		// Verify cron secret
		const cronSecret = request.headers.get('x-cron-secret');
		const expectedSecret = process.env.CRON_SECRET;

		if (!expectedSecret || cronSecret !== expectedSecret) {
			console.warn('Unauthorized attempt to trigger strategy reminder job');
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const admin = getSupabaseService();
		const stripe = getStripe();
		const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';

		// Get all active subscriptions
		const { data: subscriptions, error: subError } = await admin
			.from('subscriptions')
			.select('user_id, plan, stripe_subscription_id')
			.eq('plan', 'creator'); // Only Creator plan for now, can expand later

		if (subError) {
			console.error('Failed to fetch subscriptions:', subError);
			return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
		}

		if (!subscriptions || subscriptions.length === 0) {
			return NextResponse.json({ message: 'No active Creator subscriptions found', sent: 0 });
		}

		const now = new Date();
		const stats = {
			processed: 0,
			sent: 0,
			skipped: 0,
			errors: [] as string[],
		};

		for (const sub of subscriptions) {
			stats.processed++;

			try {
				// Get subscription details from Stripe to get current_period_end
				let periodEnd: Date | null = null;

				if (sub.stripe_subscription_id) {
					try {
						const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id) as any;
						periodEnd = new Date(stripeSub.current_period_end * 1000);
					} catch (stripeError) {
						console.warn(`Failed to fetch Stripe subscription ${sub.stripe_subscription_id}:`, stripeError);
						// Continue with next subscription
						stats.skipped++;
						continue;
					}
				}

				if (!periodEnd) {
					stats.skipped++;
					continue;
				}

				// Calculate days until period end
				const daysUntilEnd = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

				// Determine which reminder to send based on days until end
				let reminderType: 'first' | 'final' | null = null;
				if (daysUntilEnd <= FIRST_REMINDER_DAYS && daysUntilEnd > FINAL_REMINDER_DAYS) {
					reminderType = 'first';
				} else if (daysUntilEnd <= FINAL_REMINDER_DAYS && daysUntilEnd >= AUTO_CONTINUE_DAYS) {
					reminderType = 'final';
				}

				// Skip if not in a reminder window
				if (!reminderType) {
					stats.skipped++;
					continue;
				}

				// Check if reminder already sent for this billing cycle
				const cycleEndDate = periodEnd.toISOString().split('T')[0]; // YYYY-MM-DD format
				const { data: existingNotification } = await admin
					.from('strategy_notifications')
					.select('id, reminder_sent_at, user_action, reminder_type')
					.eq('user_id', sub.user_id)
					.eq('billing_cycle_end_date', cycleEndDate)
					.maybeSingle();

				// Skip if user already took action
				if (existingNotification?.user_action) {
					stats.skipped++;
					continue;
				}

				// Check if this specific reminder type already sent
				if (existingNotification?.reminder_type === reminderType) {
					stats.skipped++;
					continue;
				}

				// If final reminder requested but first wasn't sent, send first instead
				// (this handles edge cases where cron runs between 2-7 days)
				if (reminderType === 'final' && (!existingNotification || existingNotification.reminder_type !== 'first')) {
					reminderType = 'first';
					// Double-check we haven't sent first already
					if (existingNotification?.reminder_type === 'first') {
						stats.skipped++;
						continue;
					}
				}

				// Get user profile for name and email
				const { data: profile } = await admin
					.from('profiles')
					.select('email, full_name')
					.eq('id', sub.user_id)
					.maybeSingle();

				if (!profile || !profile.email) {
					stats.skipped++;
					continue;
				}

				// Get user's brand profiles from Airtable to find strategy
				const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
				const BASE_ID = process.env.AIRTABLE_BASE_ID;
				const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;
				
				let brandProfileId: string | null = null;
				if (AIRTABLE_TOKEN && BASE_ID && BRANDPROFILES_TABLE) {
					try {
						const brandRes = await fetch(
							`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}?filterByFormula={user_id}="${sub.user_id}"&sort[0][field]=created_time&sort[0][direction]=desc&maxRecords=1`,
							{
								headers: {
									Authorization: `Bearer ${AIRTABLE_TOKEN}`,
								},
							}
						);
						
						if (brandRes.ok) {
							const brandData = await brandRes.json();
							if (brandData.records && brandData.records.length > 0) {
								brandProfileId = brandData.records[0].id;
							}
						}
					} catch (error) {
						console.warn(`Failed to fetch brand profile for user ${sub.user_id}:`, error);
					}
				}

				// Format month label
				const nextMonth = new Date(periodEnd);
				nextMonth.setMonth(nextMonth.getMonth() + 1);
				const monthLabel = nextMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
				const deadlineLabel = `by ${periodEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'long' })}`;

				// Use brand profile ID as strategy identifier (or 'current' if no brand found)
				const strategyId = brandProfileId || 'current';
				const strategyUrl = brandProfileId 
					? `${appUrl}/strategy/${brandProfileId}`
					: `${appUrl}/strategy/monthly-update`;
				const keepStrategyUrl = generateEmailActionUrl({
					baseUrl: appUrl,
					userId: sub.user_id,
					action: 'strategy/keep',
					resourceId: strategyId,
				});
				const updateStrategyUrl = `${appUrl}/strategy/monthly-update`;

				// Send email
				await sendEmail({
					to: profile.email,
					subject: `Time to confirm your strategy for ${monthLabel}`,
					react: StrategyReminderEmail({
						userName: profile.full_name || 'there',
						monthLabel,
						strategyUrl,
						keepStrategyUrl,
						updateStrategyUrl,
						deadlineLabel,
					}),
					category: 'strategy',
				});

				// Record reminder sent in database
				if (existingNotification) {
					await admin
						.from('strategy_notifications')
						.update({
							reminder_sent_at: new Date().toISOString(),
							reminder_type: reminderType,
							brand_profile_id: brandProfileId,
							updated_at: new Date().toISOString(),
						})
						.eq('id', existingNotification.id);
				} else {
					await admin
						.from('strategy_notifications')
						.insert({
							user_id: sub.user_id,
							brand_profile_id: brandProfileId,
							billing_cycle_end_date: cycleEndDate,
							reminder_sent_at: new Date().toISOString(),
							reminder_type: reminderType,
						});
				}

				stats.sent++;
				console.log(`[Strategy Reminder] Sent to ${profile.email} for ${monthLabel}`);

			} catch (error: any) {
				console.error(`[Strategy Reminder] Error processing subscription for user ${sub.user_id}:`, error);
				stats.errors.push(`User ${sub.user_id}: ${error.message}`);
			}
		}

		return NextResponse.json({
			ok: true,
			message: `Strategy reminder job completed. Sent ${stats.sent} reminders.`,
			...stats,
		});
	} catch (error: any) {
		console.error('[Strategy Reminder] Job error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Failed to run strategy reminder job' },
			{ status: 500 }
		);
	}
}

