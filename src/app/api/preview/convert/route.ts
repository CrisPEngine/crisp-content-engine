import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { z } from 'zod';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

const requestSchema = z.object({
	previewPackId: z.string().uuid(),
	brandId: z.string().min(1),
});

type PreviewOutputs = {
	packTitle: string;
	sections: Array<{
		name: string;
		posts: Array<{ title: string; body: string; hooks: [string, string] }>;
	}>;
};

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
		const { previewPackId, brandId } = requestSchema.parse(body);

		console.log('[Preview Convert] start', { previewPackId, brandId, userId: user.id });

		const admin = getSupabaseService();
		
		// Load preview pack and validate ownership
		const { data: pack, error: packError } = await admin
			.from('preview_packs')
			.select('*')
			.eq('id', previewPackId)
			.eq('user_id', user.id) // Ensure ownership
			.maybeSingle();

		if (packError || !pack) {
			console.error('[Preview Convert] Preview pack not found or access denied', { previewPackId, error: packError });
			return NextResponse.json({ error: 'Preview pack not found or access denied' }, { status: 404 });
		}

		if (pack.status !== 'generated' || !pack.outputs) {
			return NextResponse.json({ error: 'Preview not ready for conversion' }, { status: 400 });
		}

		// Parse outputs
		let outputs: PreviewOutputs;
		try {
			outputs = typeof pack.outputs === 'string'
				? (JSON.parse(pack.outputs) as PreviewOutputs)
				: (pack.outputs as PreviewOutputs);
		} catch (parseError) {
			console.error('[Preview Convert] JSON parse error', { previewPackId, error: parseError });
			return NextResponse.json({ error: 'Invalid preview data format' }, { status: 400 });
		}

		// Validate outputs structure
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

		// Verify brand exists and user owns it
		const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
		const BASE_ID = process.env.AIRTABLE_BASE_ID;
		const CONTENTQUEUE_TABLE = process.env.AIRTABLE_CONTENTQUEUE_TABLE;
		const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!AIRTABLE_TOKEN || !BASE_ID || !CONTENTQUEUE_TABLE || !BRANDPROFILES_TABLE) {
			return NextResponse.json({ error: 'Airtable configuration missing' }, { status: 500 });
		}

		// Verify brand ownership
		try {
			const brandRes = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${BRANDPROFILES_TABLE}/${brandId}`, {
				headers: {
					Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				},
			});

			if (!brandRes.ok) {
				return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
			}

			const brandData = await brandRes.json();
			if (brandData.fields?.user_id !== user.id) {
				return NextResponse.json({ error: 'Unauthorized: Brand ownership mismatch' }, { status: 403 });
			}
		} catch (brandError: any) {
			console.error('[Preview Convert] Brand verification error', { brandId, error: brandError });
			return NextResponse.json({ error: 'Failed to verify brand' }, { status: 500 });
		}

		// Create ContentQueue records
		const posts = outputs.sections.flatMap((section) => section.posts);
		const records = posts.map((post) => ({
			fields: {
				hook: post.title,
				post_content: post.body,
				status: 'Needs Approval',
				platform: pack.channel || 'LinkedIn',
				brand_profile_id: [brandId],
				objective: pack.goal || '',
				campaign_name: 'Preview Conversion',
			},
		}));

		// Log the payload before sending
		console.log('[Preview Convert] Airtable ContentQueue payload', {
			previewPackId,
			brandId,
			recordCount: records.length,
			sampleRecord: records[0],
			channel: pack.channel,
		});

		try {
			console.log('[Preview Convert] writing Airtable ContentQueue', {
				previewPackId,
				brandId,
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
					previewPackId,
					brandId,
					statusCode: contentRes.status,
					errorType,
					errorMessage,
					airtableError: contentData?.error,
					recordCount: records.length,
				});
				const safeMessage = errorType === 'INVALID_VALUE_FOR_COLUMN' || errorType === 'UNKNOWN_FIELD_NAME'
					? `Invalid field in ContentQueue: ${errorMessage}`
					: 'Failed to create content posts. Please try again.';
				return NextResponse.json({ error: safeMessage }, { status: 422 });
			}

			const createdIds = contentData?.records?.map((r: any) => r.id) || [];
			console.log('[Preview Convert] success', {
				previewPackId,
				brandId,
				contentQueueRecordCount: createdIds.length,
				createdRecordIds: createdIds,
			});

			// Update preview pack status to converted (optional, for tracking)
			await admin
				.from('preview_packs')
				.update({ status: 'converted' })
				.eq('id', previewPackId)
				.eq('user_id', user.id);

			return NextResponse.json({ 
				createdCount: createdIds.length,
				redirectUrl: `/content/approval?brand_profile_id=${brandId}&source=preview`,
			});
		} catch (contentError: any) {
			console.error('[Preview Convert] ContentQueue exception', {
				previewPackId,
				brandId,
				error: contentError?.message || 'Unknown error',
			});
			return NextResponse.json({ error: 'Failed to create content posts. Please try again.' }, { status: 500 });
		}
	} catch (error: any) {
		console.error('[Preview Convert] Error:', error);
		if (error instanceof z.ZodError) {
			return NextResponse.json({ error: 'Invalid request body', details: error.issues }, { status: 400 });
		}
		return NextResponse.json({ error: error?.message || 'Failed to convert preview' }, { status: 500 });
	}
}
