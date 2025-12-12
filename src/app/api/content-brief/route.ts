/**
 * POST /api/content-brief
 * 
 * Creates a new content brief record in Airtable
 * - Validates user owns brand_profile_id
 * - Writes ContentBrief record with status "Pending Approval"
 * - Captures snapshots: strategy_snapshot_json and brief_snapshot_json
 * - Returns brief record id
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { z } from 'zod';

export const runtime = 'nodejs';

const briefSchema = z.object({
	brand_profile_id: z.string().min(1),
	brief_mode: z.enum(['continue', 'feedback']),
	cycle_start_date: z.string(),
	objective: z.string().optional().default(''),
	themes_focus: z.string().optional().default(''),
	key_dates: z.string().optional().default(''),
	feedback_notes: z.string().optional().default(''),
	content_preferences: z.string().optional().default(''),
	best_performing_post_id: z.string().optional(),
	worst_performing_post_id: z.string().optional(),
	best_post_reason: z.string().optional().default(''),
	worst_post_reason: z.string().optional().default(''),
	attachments: z.array(z.string().url()).optional().default([]),
}).superRefine((data, ctx) => {
	if (data.brief_mode === 'feedback') {
		// For feedback mode, best/worst posts are optional but recommended
		if (!data.best_performing_post_id && !data.worst_performing_post_id) {
			ctx.addIssue({
				path: ['best_performing_post_id'],
				code: z.ZodIssueCode.custom,
				message: 'Please select at least one best or worst performing post for feedback mode',
			});
		}
	}
});

export async function POST(request: Request) {
	try {
		const cookieStore = await cookies();
		const supabase = createServerClient(
			process.env.NEXT_PUBLIC_SUPABASE_URL!,
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
			{
				cookies: {
					get(name: string) {
						return cookieStore.get(name)?.value;
					},
					set(name: string, value: string, options: CookieOptions) {
						cookieStore.set({ name, value, ...options });
					},
					remove(name: string, options: CookieOptions) {
						cookieStore.set({ name, value: '', ...options });
					},
				},
			}
		);

		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();

		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const data = briefSchema.parse(body);

		// Validate user owns the brand profile
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;
		const CONTENTBRIEFS_TABLE = process.env.AIRTABLE_STRATEGYUPDATES_TABLE; // Reusing StrategyUpdates table

		if (!AIRTABLE_TOKEN || !BASE_ID || !BRANDPROFILES_TABLE || !CONTENTBRIEFS_TABLE) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// Verify brand profile ownership
		const brandRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${data.brand_profile_id}`,
			{
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
			}
		);

		if (!brandRes.ok) {
			return NextResponse.json(
				{ error: 'Brand profile not found' },
				{ status: 404 }
			);
		}

		const brandRecord = await brandRes.json();
		if (brandRecord.fields?.user_id !== user.id) {
			return NextResponse.json(
				{ error: 'Unauthorized - you do not own this brand profile' },
				{ status: 403 }
			);
		}

		// Get current strategy JSON snapshot
		const strategySnapshotJson = brandRecord.fields?.strategy_json || null;
		const strategySnapshot = strategySnapshotJson 
			? (typeof strategySnapshotJson === 'string' ? strategySnapshotJson : JSON.stringify(strategySnapshotJson))
			: null;

		// Build brief snapshot JSON
		const briefSnapshot = {
			brief_mode: data.brief_mode,
			cycle_start_date: data.cycle_start_date,
			objective: data.objective,
			themes_focus: data.themes_focus,
			key_dates: data.key_dates,
			feedback_notes: data.feedback_notes,
			content_preferences: data.content_preferences,
			best_performing_post_id: data.best_performing_post_id,
			worst_performing_post_id: data.worst_performing_post_id,
			best_post_reason: data.best_post_reason,
			worst_post_reason: data.worst_post_reason,
			attachments: data.attachments,
			submitted_at: new Date().toISOString(),
		};

		// Get recent post history snapshot (last 10 published posts)
		let recentPostHistorySnapshot = null;
		try {
			const CONTENTQUEUE_TABLE = process.env.AIRTABLE_CONTENTQUEUE_TABLE;
			if (CONTENTQUEUE_TABLE) {
				const postsUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${CONTENTQUEUE_TABLE}`);
				const filterFormula = `AND(FIND("${data.brand_profile_id}", {brand_profile_id}), {status} = "Published")`;
				postsUrl.searchParams.set('filterByFormula', filterFormula);
				postsUrl.searchParams.set('sort[0][field]', 'published_at');
				postsUrl.searchParams.set('sort[0][direction]', 'desc');
				postsUrl.searchParams.set('maxRecords', '10');

				const postsRes = await fetch(postsUrl.toString(), {
					headers: {
						Authorization: `Bearer ${AIRTABLE_TOKEN}`,
						'Content-Type': 'application/json',
					},
				});

				if (postsRes.ok) {
					const postsData = await postsRes.json();
					recentPostHistorySnapshot = JSON.stringify(
						(postsData.records || []).map((r: any) => ({
							id: r.id,
							title: r.fields?.hook || r.fields?.title || 'Untitled',
							status: r.fields?.status,
							published_at: r.fields?.published_at,
						}))
					);
				}
			}
		} catch (error) {
			console.warn('Failed to fetch recent post history:', error);
			// Don't fail the request if this fails
		}

		// Create ContentBrief record
		const cycleLabel = new Date(data.cycle_start_date).toLocaleDateString('en-US', { 
			month: 'long', 
			year: 'numeric' 
		});

		const briefPayload: any = {
			fields: {
				brand_profile_id: [data.brand_profile_id], // Link field
				user_id: user.id,
				brief_mode: data.brief_mode,
				cycle_start_date: data.cycle_start_date,
				cycle_label: cycleLabel,
				objective: data.objective || '',
				themes_focus: data.themes_focus || '',
				key_dates: data.key_dates || '',
				feedback_notes: data.feedback_notes || '',
				content_preferences: data.content_preferences || '',
				status: 'Pending Approval',
				submitted_at: new Date().toISOString(),
				strategy_snapshot_json: strategySnapshot,
				brief_snapshot_json: JSON.stringify(briefSnapshot),
			},
		};

		// Add optional fields if provided
		if (data.best_performing_post_id) {
			briefPayload.fields.best_performing_post_id = [data.best_performing_post_id];
		}
		if (data.worst_performing_post_id) {
			briefPayload.fields.worst_performing_post_id = [data.worst_performing_post_id];
		}
		if (data.best_post_reason) {
			briefPayload.fields.best_post_reason = data.best_post_reason;
		}
		if (data.worst_post_reason) {
			briefPayload.fields.worst_post_reason = data.worst_post_reason;
		}
		if (recentPostHistorySnapshot) {
			briefPayload.fields.recent_post_history_snapshot = recentPostHistorySnapshot;
		}
		if (data.attachments && data.attachments.length > 0) {
			briefPayload.fields.attachments = data.attachments.map((url: string) => ({ url }));
		}

		const createRes = await fetch(
			`https://api.airtable.com/v0/${BASE_ID}/${CONTENTBRIEFS_TABLE}`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(briefPayload),
			}
		);

		if (!createRes.ok) {
			const errorText = await createRes.text();
			console.error('Failed to create content brief:', errorText);
			return NextResponse.json(
				{ error: 'Failed to create content brief', details: errorText },
				{ status: 502 }
			);
		}

		const briefRecord = await createRes.json();

		console.log('[Content Brief] Created brief:', {
			briefId: briefRecord.id,
			brandProfileId: data.brand_profile_id,
			userId: user.id,
			briefMode: data.brief_mode,
		});

		return NextResponse.json({
			ok: true,
			brief_id: briefRecord.id,
			message: 'Content brief submitted successfully. Redirecting to dashboard...',
		});
	} catch (error: any) {
		console.error('Content brief creation error:', error);
		if (error instanceof z.ZodError) {
			return NextResponse.json(
				{ error: 'Validation error', details: error.issues },
				{ status: 400 }
			);
		}
		return NextResponse.json(
			{ error: error?.message || 'Server error' },
			{ status: 500 }
		);
	}
}
