/**
 * Content Brief Utilities
 * 
 * Functions for handling content brief approval and content generation triggers
 */

import { getSupabaseService } from '@/lib/supabaseService';

/**
 * Trigger content generation from an approved content brief
 * 
 * Loads ContentBrief and strategy_snapshot_json
 * Builds webhook payload for Make.com
 * POSTs to MAKE_CONTENT_GENERATION_WEBHOOK_URL
 */
export async function triggerContentGenerationFromBrief(briefId: string): Promise<void> {
	const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
	const BASE_ID = process.env.AIRTABLE_BASE_ID;
	const CONTENTBRIEFS_TABLE = process.env.AIRTABLE_STRATEGYUPDATES_TABLE;
	const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;
	const CONTENTQUEUE_TABLE = process.env.AIRTABLE_CONTENTQUEUE_TABLE;

	if (!AIRTABLE_TOKEN || !BASE_ID || !CONTENTBRIEFS_TABLE || !BRANDPROFILES_TABLE) {
		throw new Error('Airtable configuration missing');
	}

	const MAKE_WEBHOOK_URL = process.env.MAKE_CONTENT_GENERATION_WEBHOOK_URL;
	if (!MAKE_WEBHOOK_URL) {
		throw new Error('MAKE_CONTENT_GENERATION_WEBHOOK_URL is not configured');
	}

	// Fetch the brief record
	const briefRes = await fetch(
		`https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}/${briefId}`,
		{
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		}
	);

	if (!briefRes.ok) {
		throw new Error(`Failed to fetch brief: ${briefRes.status}`);
	}

	const briefData = await briefRes.json();
	const fields = briefData.fields || {};

	// Idempotency check: Don't allow triggering if already sent or completed
	const currentStatus = fields.status || '';
	if (currentStatus === 'Sent to Make' || currentStatus === 'Generation Completed') {
		console.log(`[Content Brief] Skipping trigger - brief ${briefId} already in status: ${currentStatus}`);
		throw new Error(`Brief already processed. Current status: ${currentStatus}`);
	}

	// Enforce strict status transition: Only allow triggering from "Approved"
	if (currentStatus !== 'Approved') {
		throw new Error(`Cannot trigger content generation. Current status: ${currentStatus}. Only briefs with status "Approved" can trigger generation.`);
	}

	// Extract brand_profile_id
	let brandProfileId: string | null = null;
	if (fields.brand_profile_id) {
		if (Array.isArray(fields.brand_profile_id)) {
			brandProfileId = fields.brand_profile_id[0] || null;
		} else if (typeof fields.brand_profile_id === 'string') {
			brandProfileId = fields.brand_profile_id;
		}
	}

	if (!brandProfileId) {
		throw new Error('Brief missing brand_profile_id');
	}

	const userId = fields.user_id;
	if (!userId) {
		throw new Error('Brief missing user_id');
	}

	// Parse strategy snapshot
	let masterStrategyJson: any = null;
	if (fields.strategy_snapshot_json) {
		try {
			masterStrategyJson = typeof fields.strategy_snapshot_json === 'string'
				? JSON.parse(fields.strategy_snapshot_json)
				: fields.strategy_snapshot_json;
		} catch (error) {
			console.warn('Failed to parse strategy_snapshot_json:', error);
		}
	}

	// Parse brief snapshot
	let briefSnapshot: any = {};
	if (fields.brief_snapshot_json) {
		try {
			briefSnapshot = typeof fields.brief_snapshot_json === 'string'
				? JSON.parse(fields.brief_snapshot_json)
				: fields.brief_snapshot_json;
		} catch (error) {
			console.warn('Failed to parse brief_snapshot_json:', error);
		}
	}

	// Get best/worst post details if provided
	let bestPost: any = null;
	let worstPost: any = null;

	if (fields.best_performing_post_id && CONTENTQUEUE_TABLE) {
		try {
			const bestPostId = Array.isArray(fields.best_performing_post_id)
				? fields.best_performing_post_id[0]
				: fields.best_performing_post_id;

			const bestPostRes = await fetch(
				`https://api.airtable.com/v0/${BASE_ID}/${CONTENTQUEUE_TABLE}/${bestPostId}`,
				{
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
				}
			);

			if (bestPostRes.ok) {
				const bestPostData = await bestPostRes.json();
				const bestFields = bestPostData.fields || {};
				bestPost = {
					id: bestPostData.id,
					title: bestFields.hook || bestFields.title || bestFields.post_title || 'Untitled',
					body_draft: bestFields.post_content || bestFields.content || bestFields.post_body || '',
					reason: fields.best_post_reason || '',
				};
			}
		} catch (error) {
			console.warn('Failed to fetch best performing post:', error);
		}
	}

	if (fields.worst_performing_post_id && CONTENTQUEUE_TABLE) {
		try {
			const worstPostId = Array.isArray(fields.worst_performing_post_id)
				? fields.worst_performing_post_id[0]
				: fields.worst_performing_post_id;

			const worstPostRes = await fetch(
				`https://api.airtable.com/v0/${BASE_ID}/${CONTENTQUEUE_TABLE}/${worstPostId}`,
				{
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
				}
			);

			if (worstPostRes.ok) {
				const worstPostData = await worstPostRes.json();
				const worstFields = worstPostData.fields || {};
				worstPost = {
					id: worstPostData.id,
					title: worstFields.hook || worstFields.title || worstFields.post_title || 'Untitled',
					body_draft: worstFields.post_content || worstFields.content || worstFields.post_body || '',
					reason: fields.worst_post_reason || '',
				};
			}
		} catch (error) {
			console.warn('Failed to fetch worst performing post:', error);
		}
	}

	// Get brand type and LinkedIn connection
	const brandRes = await fetch(
		`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${brandProfileId}`,
		{
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		}
	);

	let brandType = 'company';
	if (brandRes.ok) {
		const brandRecord = await brandRes.json();
		brandType = brandRecord.fields?.brand_type || 'company';
	}

	const admin = getSupabaseService();
	const { data: linkedInConnections } = await admin
		.from('social_connections')
		.select('person_urn, organization_urn, connection_type, brand_profile_id')
		.eq('user_id', userId)
		.eq('provider', 'linkedin');

	let personUrn: string | null = null;
	let organizationUrn: string | null = null;

	if (linkedInConnections && linkedInConnections.length > 0) {
		// Find appropriate connection
		if (brandType === 'company') {
			const conn = linkedInConnections.find(
				(c: any) => c.connection_type === 'organization' && 
					(c.brand_profile_id === brandProfileId || !c.brand_profile_id)
			) || linkedInConnections.find((c: any) => c.connection_type === 'organization');
			if (conn) {
				organizationUrn = conn.organization_urn || null;
			}
		} else {
			const conn = linkedInConnections.find(
				(c: any) => c.connection_type === 'member' && 
					(c.brand_profile_id === brandProfileId || !c.brand_profile_id)
			) || linkedInConnections.find((c: any) => c.connection_type === 'member');
			if (conn) {
				personUrn = conn.person_urn || null;
			}
		}
	}

	// Build webhook payload
	const webhookPayload = {
		mode: 'content_generation',
		trigger_type: 'content_brief_approved',
		brief_id: briefId,
		user_id: userId,
		brand_profile_id: brandProfileId,
		brand_type: brandType,
		brief_mode: fields.brief_mode || 'continue',
		monthly: {
			objective: briefSnapshot.objective || fields.objective || '',
			themes_focus: briefSnapshot.themes_focus || fields.themes_focus || '',
			key_dates: briefSnapshot.key_dates || fields.key_dates || '',
			feedback_notes: briefSnapshot.feedback_notes || fields.feedback_notes || '',
			content_preferences: briefSnapshot.content_preferences || fields.content_preferences || '',
			cycle_start_date: briefSnapshot.cycle_start_date || fields.cycle_start_date || '',
			cycle_label: fields.cycle_label || '',
			primary_goal: briefSnapshot.primary_goal || fields.primary_goal || '',
			success_metric: briefSnapshot.success_metric || fields.success_metric || '',
			cta: briefSnapshot.cta || fields.cta || '',
			cta_link: briefSnapshot.cta_link || fields.cta_link || '',
			offers_to_push: briefSnapshot.offers_to_push || fields.offers_to_push || '',
			topics_to_avoid_this_month: briefSnapshot.topics_to_avoid_this_month || fields.topics_to_avoid_this_month || '',
			competitor_or_inspo_links: briefSnapshot.competitor_or_inspo_links || fields.competitor_or_inspo_links || '',
		},
		master_strategy_json: masterStrategyJson,
		best_post: bestPost,
		worst_post: worstPost,
		person_urn: personUrn,
		organization_urn: organizationUrn,
		triggered_at: new Date().toISOString(),
	};

	// Prepare headers
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	const outboundSecret = process.env.MAKE_CONTENT_WEBHOOK_SECRET || process.env.MAKE_SHARED_SECRET;
	if (outboundSecret) {
		headers['x-make-secret'] = outboundSecret;
	}
	if (process.env.MAKE_API_KEY) {
		headers['x-api-key'] = process.env.MAKE_API_KEY;
	}

	// CRITICAL: Set status to "Sent to Make" BEFORE calling Make (for traceability)
	// This ensures we have a record even if the webhook call fails
	const sentToMakeAt = new Date().toISOString();
	const statusUpdateRes = await fetch(
		`https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}/${briefId}`,
		{
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				fields: {
					status: 'Sent to Make',
					sent_to_make_at: sentToMakeAt,
					last_error: null, // Clear any previous errors
				},
			}),
		}
	);

	if (!statusUpdateRes.ok) {
		const errorText = await statusUpdateRes.text();
		throw new Error(`Failed to update brief status before webhook call: ${errorText}`);
	}

	// Send webhook
	console.log('[Content Brief] Triggering content generation webhook:', {
		briefId,
		brandProfileId,
		userId,
		briefMode: fields.brief_mode,
		hasBestPost: !!bestPost,
		hasWorstPost: !!worstPost,
		sentToMakeAt,
	});

	const webhookRes = await fetch(MAKE_WEBHOOK_URL, {
		method: 'POST',
		headers,
		body: JSON.stringify(webhookPayload),
	});

	if (!webhookRes.ok) {
		const errorText = await webhookRes.text();
		// Update brief with error status
		await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}/${briefId}`,
			{
				method: 'PATCH',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					fields: {
						status: 'Failed',
						last_error: `Make.com webhook failed: ${webhookRes.status} - ${errorText}`,
					},
				}),
			}
		).catch(() => {}); // Ignore errors updating error field
		
		throw new Error(`Make.com webhook failed: ${webhookRes.status} - ${errorText}`);
	}

	console.log('[Content Brief] Content generation webhook triggered successfully');
}
