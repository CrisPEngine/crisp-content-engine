import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { verifyEmailActionToken } from '@/lib/email/tokenSigning';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

export async function GET(request: Request) {
	try {
		const url = new URL(request.url);
		const userId = url.searchParams.get('userId');
		const contentId = url.searchParams.get('resourceId') || url.searchParams.get('contentId');
		const token = url.searchParams.get('token');

		if (!userId || !contentId || !token) {
			return redirect('/email-action/complete?status=error&type=content_approve&message=Missing parameters');
		}

		// Verify token
		const tokenData = verifyEmailActionToken(token);
		if (!tokenData) {
			return redirect('/email-action/complete?status=error&type=content_approve&message=Invalid or expired token');
		}

		// Verify token matches request
		if (tokenData.userId !== userId || tokenData.resourceId !== contentId || tokenData.action !== 'content/approve') {
			return redirect('/email-action/complete?status=error&type=content_approve&message=Token mismatch');
		}

		// Verify user exists
		const admin = getSupabaseService();
		const { data: user } = await admin.auth.admin.getUserById(userId);
		if (!user) {
			return redirect('/email-action/complete?status=error&type=content_approve&message=User not found');
		}

		// Update content status in Airtable
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
			return redirect('/email-action/complete?status=error&type=content_approve&message=Airtable configuration missing');
		}

		// Verify content belongs to user (check via brand_profile_id)
		// First, get the content record to verify ownership
		const contentRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${contentId}`, {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		if (!contentRes.ok) {
			return redirect('/email-action/complete?status=error&type=content_approve&message=Content not found');
		}

		const contentRecord = await contentRes.json();
		const brandProfileId = contentRecord.fields?.brand_profile_id;

		if (!brandProfileId) {
			return redirect('/email-action/complete?status=error&type=content_approve&message=Content has no brand profile');
		}

		// Verify brand belongs to user
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;
		if (BRANDPROFILES_TABLE) {
			const brandRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${Array.isArray(brandProfileId) ? brandProfileId[0] : brandProfileId}`, {
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			});

			if (brandRes.ok) {
				const brandRecord = await brandRes.json();
				if (brandRecord.fields?.user_id !== userId) {
					return redirect('/email-action/complete?status=error&type=content_approve&message=Content does not belong to user');
				}
			}
		}

		// Update content status to "Ready To Publish" (or "Approved" depending on your workflow)
		const updateRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${contentId}`, {
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				fields: {
					status: 'Ready To Publish', // Change to your approved status
				},
			}),
		});

		if (!updateRes.ok) {
			const errorText = await updateRes.text();
			console.error('[Email Action] Failed to update content:', errorText);
			return redirect('/email-action/complete?status=error&type=content_approve&message=Failed to approve content');
		}

		console.log(`[Email Action] Content approved: userId=${userId}, contentId=${contentId}`);

		return redirect('/email-action/complete?status=success&type=content_approve');
	} catch (error: any) {
		console.error('[Email Action] Error in content approve:', error);
		return redirect('/email-action/complete?status=error&type=content_approve&message=' + encodeURIComponent(error.message || 'Unknown error'));
	}
}


