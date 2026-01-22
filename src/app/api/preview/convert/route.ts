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
			// Try to find the brand profile ID from the session or return generic redirect
			const redirectUrl = `/content/approval`;
			return NextResponse.json({ redirectUrl, alreadyConverted: true });
		}

		if (session.status !== 'generated' || !session.outputs_json) {
			return NextResponse.json({ error: 'Preview not ready for conversion' }, { status: 400 });
		}

		const outputs = typeof session.outputs_json === 'string'
			? (JSON.parse(session.outputs_json) as PreviewOutputs)
			: (session.outputs_json as PreviewOutputs);

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
			return NextResponse.json({ error: errorMessage }, { status: 422 });
		}

		const brandProfileId = brandData.id;
		const posts = outputs.sections.flatMap((section) => section.posts);
		const records = posts.map((post) => ({
			fields: {
				hook: post.title,
				post_content: post.body,
				status: 'Needs Approval',
				platform: 'LinkedIn',
				brand_profile_id: [brandProfileId],
				objective: session.goal || '',
				campaign_name: 'Preview Conversion',
			},
		}));

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
			return NextResponse.json({ error: errorMessage }, { status: 422 });
		}

		await admin
			.from('preview_sessions')
			.update({ status: 'converted', user_id: user.id })
			.eq('preview_session_id', previewSessionId);

		const redirectUrl = `/content/approval?brand_profile_id=${brandProfileId}`;
		return NextResponse.json({ redirectUrl });
	} catch (error: any) {
		const message = error?.message || 'Failed to convert preview';
		return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
	}
}
