import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { z } from 'zod';
import { getSupabaseService } from '@/lib/supabaseService';
import { TIMEZONES } from '@/lib/timezones';

export const runtime = 'nodejs';

const requestSchema = z.object({
	previewSessionId: z.string().min(1),
});

type PreviewOutputs = {
	packTitle: string;
	sections: Array<{
		name: string;
		posts: Array<{ title: string; body: string; hooks: [string, string] }>;
	}>;
};

function extractTopics(topics: any): string[] {
	if (!topics) return [];
	if (Array.isArray(topics)) return topics.filter((item) => typeof item === 'string');
	if (typeof topics === 'object') {
		const selected = Array.isArray(topics.selected) ? topics.selected : [];
		const other = typeof topics.other === 'string' && topics.other.trim() ? [topics.other.trim()] : [];
		return [...selected, ...other].filter((item) => typeof item === 'string');
	}
	return [];
}

export async function POST(req: Request) {
	try {
		console.log('[Preview Convert] start');
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

		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await req.json().catch(() => ({}));
		const { previewSessionId } = requestSchema.parse(body);

		if (!previewSessionId) {
			return NextResponse.json({ error: 'previewSessionId is required' }, { status: 400 });
		}

		console.log('[Preview Convert] start', { previewSessionId });

		const admin = getSupabaseService();
		const { data: session, error: sessionError } = await admin
			.from('preview_sessions')
			.select('*')
			.eq('preview_session_id', previewSessionId)
			.maybeSingle();

		if (sessionError || !session) {
			return NextResponse.json({ error: 'Preview session not found' }, { status: 404 });
		}

		// Idempotent: if already converted, return existing redirect
		if (session.status === 'converted' && session.user_id === user.id) {
			const redirectUrl = `/content/approval`;
			return NextResponse.json({ redirectUrl, alreadyConverted: true });
		}

		if (session.status !== 'generated' || !session.outputs_json) {
			return NextResponse.json({ error: 'Preview not ready for conversion' }, { status: 400 });
		}

		let outputs: PreviewOutputs;
		try {
			outputs = typeof session.outputs_json === 'string'
				? (JSON.parse(session.outputs_json) as PreviewOutputs)
				: (session.outputs_json as PreviewOutputs);
		} catch (parseError) {
			console.error('[Preview Convert] JSON parse error', { previewSessionId, error: parseError });
			return NextResponse.json({ error: 'Invalid preview data format' }, { status: 400 });
		}

		// Validate outputs structure before any external calls
		if (!outputs || typeof outputs !== 'object') {
			return NextResponse.json({ error: 'Invalid preview outputs: missing data' }, { status: 400 });
		}
		if (!outputs.packTitle || typeof outputs.packTitle !== 'string') {
			return NextResponse.json({ error: 'Invalid preview outputs: packTitle is required' }, { status: 400 });
		}
		if (!Array.isArray(outputs.sections) || outputs.sections.length === 0) {
			return NextResponse.json({ error: 'Invalid preview outputs: sections array is required' }, { status: 400 });
		}
		const postsCount = outputs.sections.reduce((count, section) => {
			if (!section.posts || !Array.isArray(section.posts)) return count;
			return count + section.posts.length;
		}, 0);
		if (postsCount === 0) {
			return NextResponse.json({ error: 'Invalid preview outputs: no posts found in sections' }, { status: 400 });
		}

		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;
		const CONTENTQUEUE_TABLE = process.env.AIRTABLE_CONTENTQUEUE_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !BRANDPROFILES_TABLE || !CONTENTQUEUE_TABLE) {
			return NextResponse.json({ error: 'Airtable configuration missing' }, { status: 500 });
		}

		const topicsList = extractTopics(session.topics);
		const topicsText = topicsList.join(', ');
		const approvalEmail = user.email || '';
		const defaultTimezone = TIMEZONES[0] || 'America/New_York — UTC−05:00';

		const brandPayload = {
			fields: {
				brand_type: 'company',
				client_name: `Preview ${session.persona || 'Brand'}`,
				website: '',
				audience: `Preview audience for ${session.persona || 'brand'}`,
				value_props: `Preview content system for ${session.goal || 'growth'}`,
				offers: 'Preview offer',
				brand_goals: session.goal || '',
				voice_rules: session.tone || '',
				brand_keywords: topicsText,
				exclude_keywords: '',
				content_rules: '',
				additional_info: '',
				platforms_requested: ['LinkedIn'],
				timezone: defaultTimezone,
				language_region: 'US English',
				preferred_image_source: 'AI Generated',
				brand_palette: '',
				approval_contact_email: approvalEmail,
				status: 'New Brief',
				strategy_approval: false,
				user_id: user.id,
			},
		};

		// Create BrandProfile in Airtable
		let brandProfileId: string;
		try {
			console.log('[Preview Convert] writing Airtable BrandProfile', { previewSessionId });
			const brandRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(brandPayload),
			});

			const brandData = await brandRes.json();
			if (!brandRes.ok) {
				const errorMessage = brandData?.error?.message || 'Failed to create BrandProfile';
				const errorType = brandData?.error?.type || 'unknown';
				console.error('[Preview Convert] Airtable BrandProfile error', {
					previewSessionId,
					statusCode: brandRes.status,
					errorType,
					errorMessage,
					airtableError: brandData?.error,
				});
				// Return safe error message (no secrets)
				const safeMessage = errorType === 'INVALID_VALUE_FOR_COLUMN' || errorType === 'UNKNOWN_FIELD_NAME'
					? `Invalid field in BrandProfile: ${errorMessage}`
					: 'Failed to create brand profile. Please try again.';
				return NextResponse.json({ error: safeMessage }, { status: 422 });
			}

			brandProfileId = brandData.id;
		} catch (brandError: any) {
			console.error('[Preview Convert] BrandProfile exception', {
				previewSessionId,
				error: brandError?.message || 'Unknown error',
			});
			return NextResponse.json({ error: 'Failed to create brand profile. Please try again.' }, { status: 500 });
		}

		// Create ContentQueue records
		const posts = outputs.sections.flatMap((section) => section.posts);
		const records = posts.map((post) => ({
			fields: {
				hook: post.title,
				post_content: post.body,
				status: 'Needs Approval', // Must match approval page filter
				platform: 'LinkedIn', // Must match expected platform values
				brand_profile_id: [brandProfileId],
				objective: session.goal || '',
				campaign_name: 'Preview Conversion',
			},
		}));

		// Log the payload before sending
		console.log('[Preview Convert] Airtable ContentQueue payload', {
			previewSessionId,
			recordCount: records.length,
			sampleRecord: records[0],
			brandProfileId,
		});

		try {
			console.log('[Preview Convert] writing Airtable ContentQueue', {
				previewSessionId,
				recordCount: records.length,
			});
			const contentRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${CONTENTQUEUE_TABLE}`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ records }),
			});

			const contentData = await contentRes.json();
			if (!contentRes.ok) {
				const errorMessage = contentData?.error?.message || 'Failed to create ContentQueue records';
				const errorType = contentData?.error?.type || 'unknown';
				console.error('[Preview Convert] Airtable ContentQueue error', {
					previewSessionId,
					statusCode: contentRes.status,
					errorType,
					errorMessage,
					airtableError: contentData?.error,
					recordCount: records.length,
				});
				// Return safe error message (no secrets)
				const safeMessage = errorType === 'INVALID_VALUE_FOR_COLUMN' || errorType === 'UNKNOWN_FIELD_NAME'
					? `Invalid field in ContentQueue: ${errorMessage}`
					: 'Failed to create content posts. Please try again.';
				return NextResponse.json({ error: safeMessage }, { status: 422 });
			}

			const createdIds = contentData?.records?.map((r: any) => r.id) || [];
			console.log('[Preview Convert] success', {
				previewSessionId,
				brandProfileId,
				contentQueueRecordCount: createdIds.length,
				createdRecordIds: createdIds,
				airtableResponse: JSON.stringify(contentData).substring(0, 500),
			});
		} catch (contentError: any) {
			console.error('[Preview Convert] ContentQueue exception', {
				previewSessionId,
				error: contentError?.message || 'Unknown error',
			});
			return NextResponse.json({ error: 'Failed to create content posts. Please try again.' }, { status: 500 });
		}

		await admin
			.from('preview_sessions')
			.update({ status: 'converted', user_id: user.id })
			.eq('preview_session_id', previewSessionId);

		// Check if user has valid brand setup - if not, redirect to onboarding
		// For now, we'll redirect to approval with source=preview to help debugging
		// If approval page is empty, user should be redirected to onboarding from there
		const redirectUrl = `/content/approval?brand_profile_id=${brandProfileId}&source=preview`;
		return NextResponse.json({ 
			redirectUrl,
			postCount: records.length,
		});
	} catch (error: any) {
		const message = error?.message || 'Failed to convert preview';
		return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
	}
}
