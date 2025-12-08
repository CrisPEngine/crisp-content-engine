import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { verifyEmailActionToken } from '@/lib/email/tokenSigning';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

export async function GET(request: Request) {
	try {
		const url = new URL(request.url);
		const userId = url.searchParams.get('userId');
		const token = url.searchParams.get('token');

		if (!userId || !token) {
			return redirect('/email-action/complete?status=error&type=approve_all_content&message=Missing parameters');
		}

		// Verify token
		const tokenData = verifyEmailActionToken(token);
		if (!tokenData) {
			return redirect('/email-action/complete?status=error&type=approve_all_content&message=Invalid or expired token');
		}

		// Verify token matches request
		if (tokenData.userId !== userId || tokenData.action !== 'content/approve-all') {
			return redirect('/email-action/complete?status=error&type=approve_all_content&message=Token mismatch');
		}

		// Verify user exists
		const admin = getSupabaseService();
		const { data: user } = await admin.auth.admin.getUserById(userId);
		if (!user) {
			return redirect('/email-action/complete?status=error&type=approve_all_content&message=User not found');
		}

		// Get Airtable configuration
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
			return redirect('/email-action/complete?status=error&type=approve_all_content&message=Airtable configuration missing');
		}

		// Get pendingIds from token resourceId (comma-separated) or fetch all pending content
		let recordIdsToApprove: string[] = [];

		if (tokenData.resourceId && tokenData.resourceId !== 'all') {
			// Token includes specific IDs (comma-separated)
			recordIdsToApprove = tokenData.resourceId.split(',').filter(id => id.trim().length > 0);
		} else {
			// Fetch all pending content for this user
			const filterFormula = `AND({user_id} = "${userId}", {status} = "Needs Approval")`;
			const fetchUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
			fetchUrl.searchParams.set('filterByFormula', filterFormula);
			fetchUrl.searchParams.set('maxRecords', '100');
			fetchUrl.searchParams.append('fields[]', 'id');

			const fetchRes = await fetch(fetchUrl.toString(), {
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			});

			if (!fetchRes.ok) {
				const errorText = await fetchRes.text();
				console.error('[Approve All] Failed to fetch pending content:', errorText);
				return redirect('/email-action/complete?status=error&type=approve_all_content&message=Failed to fetch pending content');
			}

			const fetchData = await fetchRes.json();
			recordIdsToApprove = (fetchData.records || []).map((r: any) => r.id);
		}

		if (recordIdsToApprove.length === 0) {
			return redirect('/email-action/complete?status=success&type=approve_all_content&message=No pending content to approve');
		}

		// Verify ownership of all records before approving
		// Check that all records belong to this user
		const verifyUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
		verifyUrl.searchParams.set('maxRecords', '100');
		
		// Fetch records in batches to verify ownership
		const batchSize = 10;
		let approvedCount = 0;
		let failedCount = 0;

		for (let i = 0; i < recordIdsToApprove.length; i += batchSize) {
			const batch = recordIdsToApprove.slice(i, i + batchSize);
			
			// Verify and approve each record
			for (const recordId of batch) {
				try {
					// Fetch the record to verify ownership
					const recordRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`, {
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
							'Content-Type': 'application/json',
						},
					});

					if (!recordRes.ok) {
						console.warn(`[Approve All] Record ${recordId} not found or inaccessible`);
						failedCount++;
						continue;
					}

					const recordData = await recordRes.json();
					const recordUserId = recordData.fields?.user_id;

					// Verify ownership
					if (recordUserId !== userId) {
						console.warn(`[Approve All] Record ${recordId} does not belong to user ${userId}`);
						failedCount++;
						continue;
					}

					// Verify status is still "Needs Approval"
					if (recordData.fields?.status !== 'Needs Approval') {
						console.log(`[Approve All] Record ${recordId} already approved or not pending`);
						failedCount++;
						continue;
					}

					// Approve the record
					const updateRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`, {
						method: 'PATCH',
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							fields: {
								status: 'Ready To Publish',
							},
						}),
					});

					if (!updateRes.ok) {
						const errorText = await updateRes.text();
						console.error(`[Approve All] Failed to approve record ${recordId}:`, errorText);
						failedCount++;
						continue;
					}

					approvedCount++;
				} catch (error: any) {
					console.error(`[Approve All] Error approving record ${recordId}:`, error);
					failedCount++;
				}
			}
		}

		if (approvedCount === 0) {
			return redirect('/email-action/complete?status=error&type=approve_all_content&message=No content could be approved');
		}

		console.log(`[Approve All] Approved ${approvedCount} content items for user ${userId}`);

		return redirect(`/email-action/complete?status=success&type=approve_all_content&count=${approvedCount}`);
	} catch (error: any) {
		console.error('[Approve All] Error:', error);
		return redirect('/email-action/complete?status=error&type=approve_all_content&message=' + encodeURIComponent(error.message || 'Unknown error'));
	}
}


