/**
 * Content Approval Reminder Email Job
 * 
 * Runs every 2-3 hours to send content approval reminder emails.
 * 
 * Security: Requires X-Cron-Secret header matching CRON_SECRET env variable
 * 
 * Logic:
 * 1. Query Airtable ContentQueue for records with status = "Needs Approval"
 * 2. Group by user_id
 * 3. If user has pending items and we haven't sent reminder in last X hours, send email
 * 4. Store last_approval_email_sent_at to prevent spam
 */

import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { sendEmail } from '@/lib/email/sendEmail';
import { ContentApprovalDigestEmail, ContentApprovalItem } from '@/emails/product/ContentApprovalDigestEmail';
import { generateEmailActionUrl } from '@/lib/email/tokenSigning';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

const REMINDER_COOLDOWN_HOURS = 6; // Don't send more than once every 6 hours

export async function POST(request: Request) {
	try {
		// Verify cron secret
		const cronSecret = request.headers.get('x-cron-secret');
		const expectedSecret = process.env.CRON_SECRET;

		if (!expectedSecret || cronSecret !== expectedSecret) {
			console.warn('Unauthorized attempt to trigger content approval reminder job');
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const admin = getSupabaseService();
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID || !BRANDPROFILES_TABLE) {
			return NextResponse.json({ error: 'Airtable configuration missing' }, { status: 500 });
		}

		const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';
		const now = new Date();

		// Query Airtable for content needing approval
		const filterFormula = `{status} = "Needs Approval"`;
		const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
		url.searchParams.set('filterByFormula', filterFormula);
		url.searchParams.set('maxRecords', '100');

		const fields = ['platform', 'hook', 'post_content', 'scheduled_time', 'brand_profile_id', 'user_id', 'created_time'];
		fields.forEach((field) => url.searchParams.append('fields[]', field));

		const response = await fetch(url.toString(), {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error('Airtable API error:', errorText);
			return NextResponse.json({ error: `Failed to fetch content queue: ${errorText}` }, { status: 500 });
		}

		const data = await response.json();
		const records = data.records || [];

		if (records.length === 0) {
			return NextResponse.json({ message: 'No content pending approval', sent: 0 });
		}

		// Group by user_id
		const contentByUser = new Map<string, any[]>();
		for (const record of records) {
			const userId = record.fields?.user_id;
			if (userId) {
				if (!contentByUser.has(userId)) {
					contentByUser.set(userId, []);
				}
				contentByUser.get(userId)!.push(record);
			}
		}

		const stats = {
			processed: 0,
			sent: 0,
			skipped: 0,
			errors: [] as string[],
		};

		for (const [userId, userRecords] of contentByUser.entries()) {
			stats.processed++;

			try {
				// Get user profile with last_approval_email_sent_at
				const { data: profile } = await admin
					.from('profiles')
					.select('email, full_name, last_approval_email_sent_at')
					.eq('id', userId)
					.maybeSingle();

				if (!profile || !profile.email) {
					stats.skipped++;
					continue;
				}

				// Check cooldown period (don't send if sent within last REMINDER_COOLDOWN_HOURS)
				if (profile.last_approval_email_sent_at) {
					const lastSent = new Date(profile.last_approval_email_sent_at);
					const hoursSinceLastSent = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60);
					
					if (hoursSinceLastSent < REMINDER_COOLDOWN_HOURS) {
						stats.skipped++;
						continue;
					}
				}

				// Build approval items
				const items: ContentApprovalItem[] = [];

				for (const record of userRecords.slice(0, 10)) { // Limit to 10 items per email
					const fields = record.fields || {};
					const contentId = record.id;
					const title = fields.hook || fields.post_title || 'Untitled';
					const body = fields.post_content || '';
					const shortPreview = body.length > 150 ? body.substring(0, 150) + '...' : body;
					const platform = fields.platform || 'LinkedIn';
					const scheduledTime = fields.scheduled_time 
						? new Date(fields.scheduled_time).toLocaleString('en-US', { 
							month: 'short', 
							day: 'numeric', 
							hour: 'numeric', 
							minute: '2-digit' 
						})
						: undefined;

					const viewUrl = `${appUrl}/content/approval`;
					const approveUrl = generateEmailActionUrl({
						baseUrl: appUrl,
						userId,
						action: 'content/approve',
						resourceId: contentId,
					});

					items.push({
						id: contentId,
						platform,
						title,
						shortPreview,
						scheduledTime,
						viewUrl,
						approveUrl,
					});
				}

				// Generate approve-all URL with all pending record IDs
				const allPendingIds = userRecords.map(r => r.id).join(',');
				const approveAllUrl = generateEmailActionUrl({
					baseUrl: appUrl,
					userId,
					action: 'content/approve-all',
					resourceId: allPendingIds, // Comma-separated list of record IDs
				});

				// Send email
				await sendEmail({
					to: profile.email,
					subject: `You have ${userRecords.length} post${userRecords.length !== 1 ? 's' : ''} waiting for approval`,
					react: ContentApprovalDigestEmail({
						userName: profile.full_name || 'there',
						pendingCount: userRecords.length,
						items,
						dashboardUrl: `${appUrl}/content/approval`,
						approveAllUrl,
					}),
					category: 'content',
				});

				// Update last_approval_email_sent_at
				await admin
					.from('profiles')
					.update({
						last_approval_email_sent_at: new Date().toISOString(),
					})
					.eq('id', userId);

				stats.sent++;
				console.log(`[Content Approval Reminder] Sent to ${profile.email} for ${userRecords.length} items`);

			} catch (error: any) {
				console.error(`[Content Approval Reminder] Error processing user ${userId}:`, error);
				stats.errors.push(`User ${userId}: ${error.message}`);
			}
		}

		return NextResponse.json({
			ok: true,
			message: `Content approval reminder job completed. Sent ${stats.sent} reminders.`,
			...stats,
		});
	} catch (error: any) {
		console.error('[Content Approval Reminder] Job error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Failed to run content approval reminder job' },
			{ status: 500 }
		);
	}
}

