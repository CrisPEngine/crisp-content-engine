import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { listRecords, normalizeLookup } from '@/lib/airtable/client';

export const runtime = 'nodejs';

/**
 * ContentQueue Lookup Fields
 * IMPORTANT: Use field NAMES in fields[] parameter, but responses will be keyed by field IDs
 * when returnFieldsByFieldId=true is set
 */
import { CONTENTQUEUE_LOOKUP_FIELDS } from '@/lib/airtable/field-mapping';

// Field IDs for accessing responses (when returnFieldsByFieldId=true)
const LOOKUP_FIELD_IDS = {
	brand_name_lookup: CONTENTQUEUE_LOOKUP_FIELDS.brand_name_lookup.id,
	user_id_lookup: CONTENTQUEUE_LOOKUP_FIELDS.user_id_lookup.id,
	timezone_lookup: CONTENTQUEUE_LOOKUP_FIELDS.timezone_lookup.id,
	language_region_lookup: CONTENTQUEUE_LOOKUP_FIELDS.language_region_lookup.id,
	spelling_variant_lookup: CONTENTQUEUE_LOOKUP_FIELDS.spelling_variant_lookup.id,
} as const;

// Field names for use in fields[] parameter and filter formulas
const LOOKUP_FIELD_NAMES = {
	brand_name_lookup: CONTENTQUEUE_LOOKUP_FIELDS.brand_name_lookup.name,
	user_id_lookup: CONTENTQUEUE_LOOKUP_FIELDS.user_id_lookup.name,
	timezone_lookup: CONTENTQUEUE_LOOKUP_FIELDS.timezone_lookup.name,
	language_region_lookup: CONTENTQUEUE_LOOKUP_FIELDS.language_region_lookup.name,
	spelling_variant_lookup: CONTENTQUEUE_LOOKUP_FIELDS.spelling_variant_lookup.name,
} as const;

const mapStatuses = (stage: string | null, statusParam: string | null) => {
	if (statusParam) {
		return statusParam
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
	}

	switch (stage) {
		case 'approval':
			return ['Needs Approval', 'Needs Copy', 'Needs Review'];
		case 'schedule':
			return ['Scheduled', 'Ready To Publish', 'Published', 'Failed'];
		case 'all':
			// Return all statuses for dashboard overview
			return ['Ready To Publish', 'Published', 'Scheduled', 'Needs Approval', 'Needs Copy', 'Needs Review', 'Draft'];
		default:
			return undefined;
	}
};

export async function GET(request: Request) {
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

		const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;

		if (!TABLE_ID) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing. Please contact support.' },
				{ status: 500 }
			);
		}

		const { searchParams } = new URL(request.url);
		const stage = searchParams.get('stage');
		const statusParam = searchParams.get('status');
		const brandProfileId = searchParams.get('brand_profile_id');
		const contentBriefId = searchParams.get('content_brief_id');
		const statuses = mapStatuses(stage, statusParam);

		// Build filter formula using user_id_lookup (no need to fetch BrandProfiles first)
		const filters: string[] = [];
		
		// Filter by user_id_lookup (handles both string and array from Airtable lookup)
		// Airtable lookup fields can return arrays when multiple records match
		// Use field NAME in formula (not ID) - Airtable formulas require field names
		// Use ARRAYJOIN to convert lookup array to string, then FIND to search
		// This handles both single values (strings) and arrays correctly
		// Escape user.id to prevent formula injection
		const escapedUserId = user.id.replace(/"/g, '""'); // Escape double quotes
		// ARRAYJOIN converts array to string, FIND searches within it
		// If lookup returns single value, ARRAYJOIN still works (converts to string)
		filters.push(`FIND("${escapedUserId}", ARRAYJOIN({${LOOKUP_FIELD_NAMES.user_id_lookup}}, ",")) > 0`);
		
		// Add content_brief_id filter if provided
		if (contentBriefId) {
			filters.push(`FIND("${contentBriefId}", {content_brief_id})`);
		}
		
		// Add brand_profile_id filter if provided
		if (brandProfileId) {
			filters.push(`FIND("${brandProfileId}", {brand_profile_id})`);
		}
		
		// Add status filter
		if (statuses && statuses.length > 0) {
			const statusFormula =
				statuses.length === 1
					? `{status} = "${statuses[0]}"`
					: `OR(${statuses.map((value) => `{status} = "${value}"`).join(',')})`;
			filters.push(statusFormula);
		}

		// SINGLE Airtable call: Fetch ContentQueue with lookup fields
		// No BrandProfiles queries needed - brand_name_lookup and user_id_lookup are included
		// IMPORTANT: Use field NAMES in fields[] parameter, responses will be keyed by field IDs
		const records = await listRecords({
			table: TABLE_ID,
			filterByFormula: filters.length > 0 ? `AND(${filters.join(',')})` : undefined,
			sort: [{ field: 'created_time', direction: 'desc' }],
			pageSize: 100,
			fields: [
				// Content fields (use field names)
				'platform',
				'status',
				'hook', // Title/hook
				'post_content',
				'content', // Alternative content field
				'body_draft',
				'post_title',
				'hashtags',
				'scheduled_time',
				'published_at',
				'brand_profile_id', // Link field (if needed)
				'content_brief_id', // For traceability
				'created_time',
				'updated_time',
				'image_reference_url',
				'image_cloudinary_id',
				'image_prompt',
				'image_generation_source',
				'call_to_action',
				'summary',
				'content_type',
				// Lookup fields (use field NAMES, not IDs)
				LOOKUP_FIELD_NAMES.brand_name_lookup,
				LOOKUP_FIELD_NAMES.user_id_lookup,
				LOOKUP_FIELD_NAMES.timezone_lookup,
				LOOKUP_FIELD_NAMES.language_region_lookup,
				LOOKUP_FIELD_NAMES.spelling_variant_lookup,
			],
			returnFieldsByFieldId: true, // Get responses keyed by field IDs
			endpoint: '/api/content/queue',
		});

		console.log(`[Content Queue API] Fetched ${records.length} content records in 1 Airtable call`);

		type ContentItem = {
			id: string;
			title: string;
			platform: string;
			status: string;
			content_type?: string;
			scheduled_date: string | null;
			published_at: string | null;
			brand_profile_id: string | null;
			brand_name: string;
			content: string;
			summary: string;
			call_to_action: string;
			hashtags?: string;
			image_prompt?: string;
			image_generation_source?: string;
			image_reference_url?: string;
			image_cloudinary_id?: string;
			created_time: string;
			updated_time: string | null;
		};

		// Map records using lookup fields (no BrandProfiles queries needed)
		let items: ContentItem[] = records.map((record: any) => {
			const fields = record.fields || {};
			
			// Extract brand_profile_id - could be a link field (array) or string
			let brandProfileId: string | null = null;
			if (fields.brand_profile_id) {
				if (Array.isArray(fields.brand_profile_id)) {
					const firstItem = fields.brand_profile_id[0];
					if (firstItem) {
						brandProfileId = typeof firstItem === 'string' ? firstItem : (firstItem?.id || String(firstItem));
					}
				} else if (typeof fields.brand_profile_id === 'string') {
					brandProfileId = fields.brand_profile_id;
				} else if (fields.brand_profile_id?.id) {
					brandProfileId = String(fields.brand_profile_id.id);
				}
			}

			// Use brand_name_lookup (normalize from array if needed)
			// Access by field ID since returnFieldsByFieldId=true
			const brandName = normalizeLookup(fields[LOOKUP_FIELD_IDS.brand_name_lookup]) || 'Unknown Brand';

			return {
				id: record.id,
				title: fields.hook || fields.title || fields.post_title || 'Untitled',
				platform: fields.platform || 'Blog',
				status: fields.status || 'Draft',
				content_type: fields.content_type || 'Post',
				scheduled_date: fields.scheduled_time || fields.scheduled_date || null,
				published_at: fields.published_at || null,
				brand_profile_id: brandProfileId,
				brand_name: brandName,
				content: fields.post_content || fields.content || fields.post_body || '',
				summary: fields.summary || fields.content_summary || '',
				call_to_action: fields.call_to_action || '',
				hashtags: fields.hashtags || '',
				image_prompt: fields.image_prompt || '',
				image_generation_source: fields.image_generation_source || '',
				image_reference_url: fields.image_reference_url || '',
				image_cloudinary_id: fields.image_cloudinary_id || '',
				created_time: fields.created_time || record.createdTime,
				updated_time: fields.last_modified_time || fields.updated_time || null,
			};
		});

		// Additional filtering in code (if needed for brand_profile_id or content_brief_id)
		// Note: user_id filtering is already done in Airtable query via user_id_lookup
		if (brandProfileId) {
			items = items.filter((item) => item.brand_profile_id === brandProfileId);
		}
		
		if (contentBriefId) {
			items = items.filter((item) => {
				const record = records.find((r: any) => r.id === item.id);
				if (!record) return false;
				const recordBriefId = record.fields?.content_brief_id;
				if (!recordBriefId) return false;
				const briefId = Array.isArray(recordBriefId) ? recordBriefId[0] : recordBriefId;
				return briefId === contentBriefId;
			});
		}

		// Sort by scheduled_date (earliest first), then by created_time
		items.sort((a, b) => {
			if (a.scheduled_date && b.scheduled_date) {
				return new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime();
			}
			if (a.scheduled_date) return -1;
			if (b.scheduled_date) return 1;
			return new Date(b.created_time).getTime() - new Date(a.created_time).getTime();
		});

		return NextResponse.json({ items });
	} catch (error: any) {
		console.error('content queue GET error:', error);
		return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
	}
}
