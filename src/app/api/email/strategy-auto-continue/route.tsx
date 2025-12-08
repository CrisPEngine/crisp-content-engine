/**
 * Strategy Auto-Continue Job
 * 
 * Runs daily to automatically continue strategies for users who haven't responded by the deadline.
 * 
 * Security: Requires X-Cron-Secret header matching CRON_SECRET env variable
 * 
 * Logic:
 * 1. Find users who received a reminder but haven't taken action
 * 2. If deadline has passed (1 day before period end), auto-continue their strategy
 * 3. Optionally send a confirmation email
 */

import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { getStripe } from '@/lib/stripe';
import { sendEmail } from '@/lib/email/sendEmail';
import { Text } from '@react-email/components';
import { EmailLayout } from '@/emails/components/Layout';
import { EmailHeader } from '@/emails/components/Header';
import { EmailFooter } from '@/emails/components/Footer';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

const AUTO_CONTINUE_DAYS = 1; // Auto-continue 1 day before period end

export async function POST(request: Request) {
	try {
		// Verify cron secret
		const cronSecret = request.headers.get('x-cron-secret');
		const expectedSecret = process.env.CRON_SECRET;

		if (!expectedSecret || cronSecret !== expectedSecret) {
			console.warn('Unauthorized attempt to trigger strategy auto-continue job');
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const admin = getSupabaseService();
		const stripe = getStripe();
		const now = new Date();

		const stats = {
			processed: 0,
			autoContinued: 0,
			skipped: 0,
			errors: [] as string[],
		};

		// Get all active Creator subscriptions
		const { data: subscriptions, error: subError } = await admin
			.from('subscriptions')
			.select('user_id, plan, stripe_subscription_id, current_period_end')
			.eq('plan', 'creator');

		if (subError) {
			console.error('Failed to fetch subscriptions:', subError);
			return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 });
		}

		if (!subscriptions || subscriptions.length === 0) {
			return NextResponse.json({ message: 'No active Creator subscriptions found', autoContinued: 0 });
		}

		for (const sub of subscriptions) {
			stats.processed++;

			try {
				// Get period end date
				let periodEnd: Date | null = null;

				if (sub.current_period_end) {
					periodEnd = new Date(sub.current_period_end);
				} else if (sub.stripe_subscription_id) {
					try {
						const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id) as any;
						periodEnd = new Date(stripeSub.current_period_end * 1000);
					} catch (stripeError) {
						console.warn(`Failed to fetch Stripe subscription ${sub.stripe_subscription_id}:`, stripeError);
						stats.skipped++;
						continue;
					}
				}

				if (!periodEnd) {
					stats.skipped++;
					continue;
				}

				const cycleEndDate = periodEnd.toISOString().split('T')[0];
				const daysUntilEnd = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

				// Only auto-continue if deadline has passed (1 day before period end)
				if (daysUntilEnd > AUTO_CONTINUE_DAYS) {
					stats.skipped++;
					continue;
				}

				// Check if notification exists and user hasn't taken action
				const { data: notification } = await admin
					.from('strategy_notifications')
					.select('id, reminder_sent_at, user_action, brand_profile_id')
					.eq('user_id', sub.user_id)
					.eq('billing_cycle_end_date', cycleEndDate)
					.maybeSingle();

				// Skip if no reminder was sent, or user already took action
				if (!notification || !notification.reminder_sent_at || notification.user_action) {
					stats.skipped++;
					continue;
				}

				// Get brand profile ID from notification if available
				let brandProfileId: string | null = null;
				if (notification.brand_profile_id) {
					brandProfileId = notification.brand_profile_id;
				} else {
					// Fetch brand profile from Airtable
					const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
					const BASE_ID = process.env.AIRTABLE_BASE_ID;
					const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;
					
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
				}

				// Auto-continue strategy
				await admin
					.from('strategy_notifications')
					.update({
						user_action: 'auto_continued',
						user_action_at: new Date().toISOString(),
						strategy_confirmed_for_next_cycle: true,
						brand_profile_id: brandProfileId,
						updated_at: new Date().toISOString(),
					})
					.eq('id', notification.id);

				// Get user profile for optional email
				const { data: profile } = await admin
					.from('profiles')
					.select('email, full_name')
					.eq('id', sub.user_id)
					.maybeSingle();

				if (profile && profile.email) {
					// Optional: Send confirmation email
					const nextMonth = new Date(periodEnd);
					nextMonth.setMonth(nextMonth.getMonth() + 1);
					const monthLabel = nextMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

					try {
						await sendEmail({
							to: profile.email,
							subject: `Strategy confirmed for ${monthLabel}`,
							react: (
								<EmailLayout preview={`We have continued with your existing strategy for ${monthLabel}`}>
									<EmailHeader />
									<div style={{ padding: '0 24px 24px 24px' }}>
										<h1 style={{ fontSize: '22px', color: '#FFFFFF', fontWeight: '600', margin: '0 0 16px 0', textAlign: 'center' }}>
											Strategy confirmed for {monthLabel}
										</h1>
										<Text style={{ color: '#9CA3AF', fontSize: '15px', lineHeight: '22px', margin: '0 0 20px 0' }}>
											Hi {profile.full_name || 'there'},
											<br />
											<br />
											We have automatically continued with your existing strategy for {monthLabel} since you didn't respond by the deadline.
										</Text>
										<Text style={{ color: '#6B7280', fontSize: '13px', lineHeight: '20px', margin: '24px 0 0 0', textAlign: 'center' }}>
											You can still update your strategy at any time from your dashboard.
										</Text>
									</div>
									<EmailFooter />
								</EmailLayout>
							),
							category: 'strategy',
						});
					} catch (emailError) {
						console.warn(`Failed to send auto-continue email to ${profile.email}:`, emailError);
						// Don't fail the job if email fails
					}
				}

				// Trigger content creation for the confirmed strategy
				if (brandProfileId) {
					try {
						// Get LinkedIn connection for this brand
						const { data: linkedInConnection } = await admin
							.from('social_connections')
							.select('person_urn, organization_urn, connection_type, brand_profile_id')
							.eq('brand_profile_id', brandProfileId)
							.eq('provider', 'linkedin')
							.maybeSingle();

						const { triggerContentCreationForBrand } = await import('@/lib/email/contentCreation');
						await triggerContentCreationForBrand(
							brandProfileId,
							sub.user_id,
							linkedInConnection?.person_urn || null,
							linkedInConnection?.organization_urn || null
						);
					} catch (contentError: any) {
						console.error(`[Strategy Auto-Continue] Failed to trigger content creation for user ${sub.user_id}:`, contentError);
						// Don't fail the job - content creation can be retried
					}
				}

				stats.autoContinued++;
				console.log(`[Strategy Auto-Continue] Auto-continued strategy for user ${sub.user_id}, cycle ending ${cycleEndDate}`);

			} catch (error: any) {
				console.error(`[Strategy Auto-Continue] Error processing subscription for user ${sub.user_id}:`, error);
				stats.errors.push(`User ${sub.user_id}: ${error.message}`);
			}
		}

		return NextResponse.json({
			ok: true,
			message: `Strategy auto-continue job completed. Auto-continued ${stats.autoContinued} strategies.`,
			...stats,
		});
	} catch (error: any) {
		console.error('[Strategy Auto-Continue] Job error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Failed to run strategy auto-continue job' },
			{ status: 500 }
		);
	}
}

