/**
 * Content Batch Ready Hook
 * 
 * Called by Make.com when a new batch of content has been created.
 * Sends "new content ready" email to users if they are not currently active.
 * 
 * Security: Requires X-Make-Secret header matching webhook secret
 */

import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { sendEmail } from '@/lib/email/sendEmail';
import { ContentBatchReadyEmail, ContentBatchItem } from '@/emails/product/ContentBatchReadyEmail';
import { generateEmailActionUrl } from '@/lib/email/tokenSigning';
import { z } from 'zod';

export const runtime = 'nodejs';

const batchReadySchema = z.object({
	userId: z.string(),
	brandProfileId: z.string(),
	contentItemIds: z.array(z.string()).min(1),
});

export async function POST(request: Request) {
	try {
		// Verify webhook secret (optional - can be disabled if not needed)
		const webhookSecret = request.headers.get('x-make-secret');
		const expectedSecret =
			process.env.MAKE_CONTENT_WEBHOOK_SECRET ||
			process.env.MAKE_SHARED_SECRET ||
			process.env.CONTENT_WEBHOOK_SECRET;

		// Only validate if secret is configured
		if (expectedSecret && webhookSecret !== expectedSecret) {
			console.warn('Unauthorized attempt to trigger content batch ready hook');
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const validated = batchReadySchema.parse(body);
		const { userId, brandProfileId, contentItemIds } = validated;

		const admin = getSupabaseService();
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const CONTENTQUEUE_TABLE = process.env.AIRTABLE_CONTENTQUEUE_TABLE;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !CONTENTQUEUE_TABLE || !BRANDPROFILES_TABLE) {
			return NextResponse.json({ error: 'Airtable configuration missing' }, { status: 500 });
		}

		// Check if user is active (simple heuristic: always send for now)
		// TODO: Implement last_seen_at tracking in profiles table
		// For now, we'll always send the email
		// const { data: profile } = await admin
		//   .from('profiles')
		//   .select('last_seen_at')
		//   .eq('id', userId)
		//   .single();
		// const isUserActive = profile?.last_seen_at && 
		//   Date.now() - new Date(profile.last_seen_at).getTime() < 30 * 60 * 1000; // 30 minutes
		// if (isUserActive) {
		//   return NextResponse.json({ message: 'User active, skipped batch ready email', skipped: true });
		// }

		// Get user profile for email
		const { data: profile } = await admin
			.from('profiles')
			.select('email, full_name, last_seen_at')
			.eq('id', userId)
			.maybeSingle();

		if (!profile || !profile.email) {
			return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
		}

		// Simple active check: if last_seen_at exists and is within 30 minutes, skip
		let isUserActive = false;
		if (profile.last_seen_at) {
			const lastSeen = new Date(profile.last_seen_at).getTime();
			const now = Date.now();
			isUserActive = now - lastSeen < 30 * 60 * 1000; // 30 minutes
		}

		if (isUserActive) {
			return NextResponse.json({
				message: 'User active, skipped batch ready email',
				skipped: true,
				lastSeenAt: profile.last_seen_at,
			});
		}

		// Get brand profile details
		const brandRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${brandProfileId}`,
			{
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			}
		);

		if (!brandRes.ok) {
			return NextResponse.json({ error: 'Brand profile not found' }, { status: 404 });
		}

		const brandData = await brandRes.json();
		const brandName = brandData.fields?.client_name || brandData.fields?.personal_full_name || 'your brand';

		// Fetch sample content items (3-5) to show in email
		const sampleSize = Math.min(5, contentItemIds.length);
		const sampleIds = contentItemIds.slice(0, sampleSize);

		const items: ContentBatchItem[] = [];
		const platformsSet = new Set<string>();

		for (const itemId of sampleIds) {
			try {
				const itemRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${CONTENTQUEUE_TABLE}/${itemId}`, {
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
				});

				if (itemRes.ok) {
					const itemData = await itemRes.json();
					const fields = itemData.fields || {};
					const platform = fields.platform || 'LinkedIn';
					const title = fields.hook || fields.post_title || 'Untitled';
					const body = fields.post_content || '';
					const shortPreview = body.length > 100 ? body.substring(0, 100) + '...' : body;

					platformsSet.add(platform);

					items.push({
						id: itemId,
						platform,
						title,
						shortPreview,
					});
				}
			} catch (error) {
				console.warn(`Failed to fetch content item ${itemId}:`, error);
			}
		}

		// Determine period label (next 30 days is default)
		const periodLabel = 'Next 30 days';

		// Generate approve-all URL
		const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';
		const approveAllUrl = generateEmailActionUrl({
			baseUrl: appUrl,
			userId,
			action: 'content/approve-all',
			resourceId: contentItemIds.join(','), // All content IDs
		});

		const dashboardUrl = `${appUrl}/content/approval`;

		// Send email
		await sendEmail({
			to: profile.email,
			subject: `Your new content batch for ${brandName} is ready for review`,
			react: ContentBatchReadyEmail({
				userName: profile.full_name || 'there',
				brandName,
				itemCount: contentItemIds.length,
				items,
				platforms: Array.from(platformsSet),
				periodLabel,
				dashboardUrl,
				approveAllUrl,
			}),
			category: 'content',
		});

		console.log(`[Content Batch Ready] Sent email to ${profile.email} for ${contentItemIds.length} items`);

		return NextResponse.json({
			ok: true,
			message: 'Batch ready email sent successfully',
			userActive: false,
		});
	} catch (error: any) {
		if (error instanceof z.ZodError) {
			return NextResponse.json(
				{ error: 'Validation error', details: error.issues },
				{ status: 400 }
			);
		}

		console.error('[Content Batch Ready] Hook error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Failed to process batch ready hook' },
			{ status: 500 }
		);
	}
}

