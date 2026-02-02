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

/**
 * ContentQueue Field IDs (for accessing responses when returnFieldsByFieldId=true)
 * Field ID to Field Name mapping (from Airtable):
 * fldtucAvhPkP0ZWY7 = "client_name"
 * fldDHJ0Rx7Rbzlu4a = "brand_name_lookup"
 * fldXszK9zI99mukqB = "user_id_lookup"
 * fldY4TjWWgthnDiw4 = "platform"
 * fldWqjs9EVHNJjV37 = "topic_bucket"
 * fldVPEPwwoyfEmjIn = "hook"
 * fldxVHLUkrlcxx7Ua = "post_content"
 * fldixSg2juCZLJ7R7 = "hashtags"
 * fldapoV6GTKnQkzD4 = "image_prompt"
 * fldYU7HnycHcwrUFH = "status"
 * fld7ePgW2x14v5e4o = "scheduled_time"
 * fldnI4lMIwnC6jZbo = "scheduled_timezone"
 * fldumyzHN5hyImgti = "created_time"
 * flduEbzJOpC8HYuJn = "last_modified"
 * fldR5AZaDc07gArxv = "publish_text"
 * flduUgRnky0IgKH5K = "record_id"
 * fldqCh274V2Ih2PPS = "brand_profile_id"
 * fld4HM3lrGKUq92kJ = "call_to_action"
 * fldf58Nezm4kywo6T = "image_generation_source"
 * fldRRlsSTQC9IZbt5 = "image_reference_url"
 * fldILkq0eG4tSV6GC = "approved_at"
 * fldIT2FuismZkp9ZU = "published_at"
 * fldCevmF49JFuHkLE = "published_url"
 */
const CONTENTQUEUE_FIELD_IDS = {
	// Core fields
	platform: 'fldY4TjWWgthnDiw4',
	status: 'fldYU7HnycHcwrUFH',
	hook: 'fldVPEPwwoyfEmjIn',
	post_content: 'fldxVHLUkrlcxx7Ua',
	hashtags: 'fldixSg2juCZLJ7R7',
	scheduled_time: 'fld7ePgW2x14v5e4o',
	scheduled_timezone: 'fldnI4lMIwnC6jZbo',
	image_prompt: 'fldapoV6GTKnQkzD4',
	brand_profile_id: 'fldqCh274V2Ih2PPS',
	created_time: 'fldumyzHN5hyImgti',
	last_modified: 'flduEbzJOpC8HYuJn',
	// Additional fields
	client_name: 'fldtucAvhPkP0ZWY7',
	topic_bucket: 'fldWqjs9EVHNJjV37',
	publish_text: 'fldR5AZaDc07gArxv',
	record_id: 'flduUgRnky0IgKH5K',
	call_to_action: 'fld4HM3lrGKUq92kJ',
	image_generation_source: 'fldf58Nezm4kywo6T',
	image_reference_url: 'fldRRlsSTQC9IZbt5',
	approved_at: 'fldILkq0eG4tSV6GC',
	published_at: 'fldIT2FuismZkp9ZU',
	published_url: 'fldCevmF49JFuHkLE',
} as const;

/**
 * Helper to get field value by ID or name (for backward compatibility)
 * When returnFieldsByFieldId=true, fields are keyed by ID, not name
 * This helper tries ID first, then falls back to name
 */
function getFieldValue(fields: any, fieldId: string | undefined, fieldName: string): any {
	if (!fieldId) {
		// No field ID provided, use name only
		return fields[fieldName];
	}
	// Try field ID first (when returnFieldsByFieldId=true), then fallback to name
	return fields[fieldId] ?? fields[fieldName];
}

const mapStatuses = (stage: string | null, statusParam: string | null) => {
	if (statusParam) {
		return statusParam
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
	}

	switch (stage) {
		case 'approval':
			// Include all statuses that need approval, plus Draft (for newly created content)
			return ['Needs Approval', 'Needs Copy', 'Needs Review', 'Draft'];
		case 'schedule':
			return ['Scheduled', 'Ready To Publish', 'Published', 'Failed'];
		case 'all':
			// Return all statuses for dashboard overview
			return ['Ready To Publish', 'Published', 'Scheduled', 'Needs Approval', 'Needs Copy', 'Needs Review', 'Draft'];
		default:
			// If no stage specified, show all approval-related statuses by default
			// This ensures content is visible even if stage param is missing
			return ['Needs Approval', 'Needs Copy', 'Needs Review', 'Draft'];
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
		const platformFilter = searchParams.get('platform'); // New: for channel tabs
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
		
		// Add platform filter (for channel tabs)
		if (platformFilter) {
			// Support "Meta" as shorthand for Instagram+Facebook
			if (platformFilter === 'Meta') {
				filters.push(`OR({platform}="Instagram",{platform}="Facebook")`);
			} else {
				const escapedPlatform = platformFilter.replace(/"/g, '""');
				filters.push(`{platform}="${escapedPlatform}"`);
			}
		}
		
		// Add content_brief_id filter if provided
		if (contentBriefId) {
			filters.push(`FIND("${contentBriefId}", {content_brief_id})`);
		}
		
		// Note: brand_profile_id filtering is done in JavaScript after fetching records
		// This is more reliable than Airtable formula filtering for linked record fields
		// See JavaScript filter below around line 380
		
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
				// Content fields (use exact field names from Airtable - these are sent to Airtable API)
				// Only include fields that actually exist in your Airtable table
				'platform',
				'status',
				'hook',
				'post_content',
				'hashtags',
				'scheduled_time',
				'brand_profile_id',
				'image_prompt',
				'created_time',
				'last_modified',
				// Multi-channel fields (new)
				'post_type',
				'thread_group_id',
				'thread_index',
				'character_count',
				'visual_brief',
				'generation_job_id',
				'content_item_key',
				// Optional fields (only include if they exist in your Airtable table)
				'published_at',
				'image_reference_url',
				'image_generation_source',
				'call_to_action',
				'publish_text',
				// NOTE: The following fields are NOT in ContentQueue table yet:
				// 'image_cloudinary_id' - Cloudinary image ID (for future image management)
				// 'summary' - Content summary/description (for future content previews)
				// 'content_type' - Type of content like "Post", "Article", "Video" (for future content categorization)
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
			// Multi-channel fields
			post_type?: string;
			thread_group_id?: string | null;
			thread_index?: number | null;
			character_count?: number | null;
			visual_brief?: string | null;
			generation_job_id?: string | null;
			content_item_key?: string | null;
		};

		// Map records using lookup fields (no BrandProfiles queries needed)
		let items: ContentItem[] = records
			.map((record: any) => {
				const fields = record.fields || {};
				
				// Helper to access fields - try by ID first (returnFieldsByFieldId=true), then by name
				// Note: We don't have field IDs for all regular fields, so we rely on name fallback
				const getField = (fieldName: string, fieldId?: string) => getFieldValue(fields, fieldId, fieldName);
				
				// Extract brand_profile_id - could be a link field (array) or string
				// With returnFieldsByFieldId=true, we need to check both ID and name
				const brandProfileIdField = getField('brand_profile_id');
				let brandProfileId: string | null = null;
				if (brandProfileIdField) {
					if (Array.isArray(brandProfileIdField)) {
						const firstItem = brandProfileIdField[0];
						if (firstItem) {
							brandProfileId = typeof firstItem === 'string' ? firstItem : (firstItem?.id || String(firstItem));
						}
					} else if (typeof brandProfileIdField === 'string') {
						brandProfileId = brandProfileIdField;
					} else if (brandProfileIdField?.id) {
						brandProfileId = String(brandProfileIdField.id);
					}
				}

				// Use brand_name_lookup (normalize from array if needed)
				// Access by field ID since returnFieldsByFieldId=true
				const brandName = normalizeLookup(fields[LOOKUP_FIELD_IDS.brand_name_lookup]) || 'Unknown Brand';

				const title = getField('hook', CONTENTQUEUE_FIELD_IDS.hook) || getField('title') || getField('post_title') || '';
				const content = getField('post_content', CONTENTQUEUE_FIELD_IDS.post_content) || getField('post_body') || '';

				// Default platform to 'Blog' if empty (for Creator tier content where Make might not set it)
				const platform = getField('platform', CONTENTQUEUE_FIELD_IDS.platform) || 'Blog';
				
				return {
					id: record.id,
					title: title || 'Untitled',
					platform,
					status: getField('status', CONTENTQUEUE_FIELD_IDS.status) || 'Draft',
					content_type: getField('content_type') || 'Post',
					scheduled_date: getField('scheduled_time', CONTENTQUEUE_FIELD_IDS.scheduled_time) || getField('scheduled_date') || null,
					brand_profile_id: brandProfileId,
					brand_name: brandName,
					// IMPORTANT: 'content' field doesn't exist - only use post_content
					content: content,
					summary: getField('summary') || getField('content_summary') || '',
					call_to_action: getField('call_to_action', CONTENTQUEUE_FIELD_IDS.call_to_action) || '',
					hashtags: getField('hashtags', CONTENTQUEUE_FIELD_IDS.hashtags) || '',
					image_prompt: getField('image_prompt', CONTENTQUEUE_FIELD_IDS.image_prompt) || '',
					image_generation_source: getField('image_generation_source', CONTENTQUEUE_FIELD_IDS.image_generation_source) || '',
					image_reference_url: getField('image_reference_url', CONTENTQUEUE_FIELD_IDS.image_reference_url) || '',
					image_cloudinary_id: getField('image_cloudinary_id') || '',
					created_time: getField('created_time', CONTENTQUEUE_FIELD_IDS.created_time) || record.createdTime,
					updated_time: getField('last_modified', CONTENTQUEUE_FIELD_IDS.last_modified) || getField('updated_time') || null,
					published_at: getField('published_at', CONTENTQUEUE_FIELD_IDS.published_at) || null,
					// Multi-channel fields
					post_type: getField('post_type') || 'single',
					thread_group_id: getField('thread_group_id') || null,
					thread_index: getField('thread_index') ? Number(getField('thread_index')) : null,
					character_count: getField('character_count') ? Number(getField('character_count')) : null,
					visual_brief: getField('visual_brief') || null,
					generation_job_id: getField('generation_job_id') || null,
					content_item_key: getField('content_item_key') || null,
				};
			})
			// Filter out records with no content (deleted/empty records)
			// Airtable may return records that have been soft-deleted (fields cleared but record exists)
			.filter((item) => {
				// Keep records that have either a meaningful title or content
				const hasTitle = item.title && item.title.trim() && item.title !== 'Untitled';
				const hasContent = item.content && item.content.trim();
				// Filter out records where both title and content are empty/blank
				// This handles cases where records were deleted but still exist in Airtable
				return hasTitle || hasContent;
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
