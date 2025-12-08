/**
 * Content Auto-Publish Job
 * 
 * Runs every hour to auto-publish content that has passed its approval deadline.
 * 
 * Security: Requires X-Cron-Secret header matching CRON_SECRET env variable
 * 
 * Logic:
 * 1. Query Airtable for content with status = "Needs Approval"
 * 2. Check if auto_publish_deadline <= now
 * 3. Auto-approve and set status to "Ready To Publish"
 * 4. Optionally send summary email to user
 */

import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { sendEmail } from '@/lib/email/sendEmail';
import { Text } from '@react-email/components';
import { EmailLayout } from '@/emails/components/Layout';
import { EmailHeader } from '@/emails/components/Header';
import { EmailFooter } from '@/emails/components/Footer';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

export async function POST(request: Request) {
	// DISABLED: Content auto-publish has been removed per requirements
	// Content must be explicitly approved by users via email actions
	return NextResponse.json({
		ok: true,
		message: 'Content auto-publish is disabled. Content must be explicitly approved by users.',
		disabled: true,
	});

	/* DISABLED CODE - Content auto-publish removed
	try {
		// Verify cron secret
		const cronSecret = request.headers.get('x-cron-secret');
		const expectedSecret = process.env.CRON_SECRET;

		if (!expectedSecret || cronSecret !== expectedSecret) {
			console.warn('Unauthorized attempt to trigger content auto-publish job');
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const admin = getSupabaseService();
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
			return NextResponse.json({ error: 'Airtable configuration missing' }, { status: 500 });
		}

		const now = new Date();
		const nowISO = now.toISOString();

		// Query Airtable for content needing approval with deadline passed
		// Note: We'll check auto_publish_deadline in code since Airtable formula filtering is limited
		const filterFormula = `{status} = "Needs Approval"`;
		const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
		url.searchParams.set('filterByFormula', filterFormula);
		url.searchParams.set('maxRecords', '100');

		const fields = ['platform', 'hook', 'post_content', 'auto_publish_deadline', 'user_id', 'brand_profile_id'];
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
			return NextResponse.json({ message: 'No content pending approval', autoPublished: 0 });
		}

		// Filter records where deadline has passed
		const recordsToPublish = records.filter((record: any) => {
			const deadline = record.fields?.auto_publish_deadline;
			if (!deadline) return false; // Skip if no deadline set
			const deadlineDate = new Date(deadline);
			return deadlineDate <= now;
		});

		if (recordsToPublish.length === 0) {
			return NextResponse.json({ message: 'No content ready for auto-publish', autoPublished: 0 });
		}

		// Group by user_id for summary emails
		const contentByUser = new Map<string, any[]>();
		for (const record of recordsToPublish) {
			const userId = record.fields?.user_id;
			if (userId) {
				if (!contentByUser.has(userId)) {
					contentByUser.set(userId, []);
				}
				contentByUser.get(userId)!.push(record);
			}
		}

		const stats = {
			processed: recordsToPublish.length,
			autoPublished: 0,
			failed: 0,
			errors: [] as string[],
		};

		// Auto-approve each record
		for (const record of recordsToPublish) {
			try {
				const updateRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${record.id}`, {
					method: 'PATCH',
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						fields: {
							status: 'Ready To Publish', // Change to approved status
						},
					}),
				});

				if (!updateRes.ok) {
					const errorText = await updateRes.text();
					console.error(`Failed to auto-publish content ${record.id}:`, errorText);
					stats.failed++;
					stats.errors.push(`Record ${record.id}: ${errorText}`);
					continue;
				}

				stats.autoPublished++;
				console.log(`[Content Auto-Publish] Auto-published content ${record.id}`);
			} catch (error: any) {
				console.error(`[Content Auto-Publish] Error publishing record ${record.id}:`, error);
				stats.failed++;
				stats.errors.push(`Record ${record.id}: ${error.message}`);
			}
		}

		// Send summary emails to users
		for (const [userId, userRecords] of contentByUser.entries()) {
			try {
				const { data: profile } = await admin
					.from('profiles')
					.select('email, full_name')
					.eq('id', userId)
					.maybeSingle();

				if (profile && profile.email && userRecords.length > 0) {
					await sendEmail({
						to: profile.email,
						subject: `We published ${userRecords.length} post${userRecords.length !== 1 ? 's' : ''} that were waiting for approval`,
						react: (
							<EmailLayout preview={`We published ${userRecords.length} post${userRecords.length !== 1 ? 's' : ''} that were waiting for approval`}>
								<EmailHeader />
								<div style={{ padding: '0 24px 24px 24px' }}>
									<h1 style={{ fontSize: '22px', color: '#FFFFFF', fontWeight: '600', margin: '0 0 16px 0', textAlign: 'center' }}>
										Content Auto-Published
									</h1>
									<Text style={{ color: '#9CA3AF', fontSize: '15px', lineHeight: '22px', margin: '0 0 20px 0' }}>
										Hi {profile.full_name || 'there'},
										<br />
										<br />
										We automatically published {userRecords.length} post{userRecords.length !== 1 ? 's' : ''} that were waiting for approval and had passed the 48-hour deadline.
									</Text>
									<Text style={{ color: '#6B7280', fontSize: '13px', lineHeight: '20px', margin: '24px 0 0 0', textAlign: 'center' }}>
										These posts will be published according to your schedule. You can view them in your dashboard.
									</Text>
								</div>
								<EmailFooter />
							</EmailLayout>
						),
						category: 'content',
					});
				}
			} catch (emailError) {
				console.warn(`Failed to send auto-publish summary email to user ${userId}:`, emailError);
				// Don't fail the job if email fails
			}
		}

		return NextResponse.json({
			ok: true,
			message: `Content auto-publish job completed. Auto-published ${stats.autoPublished} items.`,
			...stats,
		});
	} catch (error: any) {
		console.error('[Content Auto-Publish] Job error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Failed to run content auto-publish job' },
			{ status: 500 }
		);
	}
	END DISABLED CODE */
}

