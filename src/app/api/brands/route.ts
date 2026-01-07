import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { listRecords } from '@/lib/airtable/client';

export const runtime = 'nodejs';

/**
 * BrandProfiles Rollup Fields
 * IMPORTANT: Use field NAMES in fields[] parameter, but responses will be keyed by field IDs
 * when returnFieldsByFieldId=true is set
 */
import { BRANDPROFILES_ROLLUP_FIELDS } from '@/lib/airtable/field-mapping';

// Field IDs for accessing responses (when returnFieldsByFieldId=true)
const ROLLUP_FIELD_IDS = {
	needs_approval_count: BRANDPROFILES_ROLLUP_FIELDS.needs_approval_count.id,
	ready_to_publish_count: BRANDPROFILES_ROLLUP_FIELDS.ready_to_publish_count.id,
	scheduled_count: BRANDPROFILES_ROLLUP_FIELDS.scheduled_count.id,
	published_count: BRANDPROFILES_ROLLUP_FIELDS.published_count.id,
} as const;

// Field names for use in fields[] parameter
const ROLLUP_FIELD_NAMES = {
	needs_approval_count: BRANDPROFILES_ROLLUP_FIELDS.needs_approval_count.name,
	ready_to_publish_count: BRANDPROFILES_ROLLUP_FIELDS.ready_to_publish_count.name,
	scheduled_count: BRANDPROFILES_ROLLUP_FIELDS.scheduled_count.name,
	published_count: BRANDPROFILES_ROLLUP_FIELDS.published_count.name,
} as const;

export async function GET(req: Request) {
	try {
		// Authenticate user
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

		const { data: { user }, error: userErr } = await supabase.auth.getUser();

		if (userErr || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const TABLE_ID = process.env.AIRTABLE_BRANDPROFILES_TABLE;

		if (!TABLE_ID) {
			return NextResponse.json(
				{ error: 'Airtable configuration missing' },
				{ status: 500 }
			);
		}

		// SINGLE Airtable call: Fetch brand profiles with rollup fields
		// No additional ContentQueue queries needed - counts come from rollups
		// IMPORTANT: Use field NAMES in fields[] parameter, responses will be keyed by field IDs
		try {
			// Base fields that should always exist
			const baseFields = [
				'client_name', // Primary name field
				'status',
				'created_time',
				'platforms_requested',
				'strategy_summary',
				'strategy_json', // Actual field name (not strategy_payload)
				'strategy_meta',
			];
			
			// Include all rollup fields - they now have actual field names from Airtable
			const rollupFieldNames = [
				ROLLUP_FIELD_NAMES.needs_approval_count,
				ROLLUP_FIELD_NAMES.ready_to_publish_count,
				ROLLUP_FIELD_NAMES.scheduled_count,
				ROLLUP_FIELD_NAMES.published_count,
			].filter(Boolean); // Filter out any undefined/null values
			
			let records;
			try {
				// First try with all fields including rollups (if they exist)
				records = await listRecords({
					table: TABLE_ID,
					filterByFormula: `{user_id} = "${user.id}"`,
					sort: [{ field: 'created_time', direction: 'desc' }],
					fields: rollupFieldNames.length > 0 ? [...baseFields, ...rollupFieldNames] : baseFields,
					cache: true,
					returnFieldsByFieldId: true,
					endpoint: '/api/brands',
				});
			} catch (error: any) {
				// If rollup fields don't exist, fetch without them
				if (error?.message?.includes('UNKNOWN_FIELD_NAME')) {
					console.warn('[Brands API] Some rollup fields not found, fetching without them. Please update field-mapping.ts with actual field names.');
					records = await listRecords({
						table: TABLE_ID,
						filterByFormula: `{user_id} = "${user.id}"`,
						sort: [{ field: 'created_time', direction: 'desc' }],
						fields: baseFields,
						cache: true,
						returnFieldsByFieldId: true,
						endpoint: '/api/brands',
					});
				} else {
					throw error; // Re-throw if it's a different error
				}
			}

			const normaliseStatus = (status: string | undefined) => {
				if (status === 'Strategy Ready (Awaiting Approval)') return 'Strategy Ready';
				return status || 'New Brief';
			};

			// Map Airtable records to our format using rollup fields
			const profiles = records.map((record: any) => {
				const fields = record.fields || {};
				
				// Helper to get field value by ID or name (for backward compatibility)
				// When returnFieldsByFieldId=true, fields are keyed by ID, not name
				const getField = (fieldName: string, fieldId?: string): any => {
					if (!fieldId) {
						// No field ID provided, try name (fallback)
						return fields[fieldName];
					}
					// Try field ID first (when returnFieldsByFieldId=true), then fallback to name
					return (fields as any)[fieldId] ?? fields[fieldName];
				};
				
				// IMPORTANT: With returnFieldsByFieldId=true, ALL fields are keyed by field IDs, not names
				// We need to access by field ID. Since we don't have BrandProfiles field IDs yet,
				// we'll try accessing by name as a fallback, but it likely won't work.
				// The field is probably keyed by something like 'fld...' (field ID)
				
				// Try to find client_name by searching all field values
				// This is a workaround until we have the actual field IDs
				let clientName: any = undefined;
				let status: any = undefined;
				
				// First, try direct access by name (won't work with returnFieldsByFieldId=true, but worth trying)
				clientName = fields.client_name;
				status = fields.status;
				
				// If that didn't work, try to find it by value (last resort)
				// This is inefficient but will work until we have field IDs
				if (!clientName) {
					// Log all field keys to help identify the field ID
					const fieldKeys = Object.keys(fields);
					console.log(`[Brands API] Record ${record.id} - Field keys (first 10):`, fieldKeys.slice(0, 10));
					
					// Try to find a field that looks like a name (string value)
					// This is a temporary workaround
					for (const key of fieldKeys) {
						const value = (fields as any)[key];
						if (typeof value === 'string' && value.length > 0 && value.length < 100) {
							// Could be a name - but we can't be sure which field it is
							// For now, we'll just log it
							if (key.startsWith('fld')) {
								console.log(`[Brands API] Found potential name field ${key}:`, value.substring(0, 50));
							}
						}
					}
				}
				
				const normalisedStatus = normaliseStatus(status);
				
				// Use rollup counts to determine if there's pending content
				// has_pending_content = true if any count > 0 (except published)
				// Access by field ID since returnFieldsByFieldId=true
				// Rollup fields may not exist, so safely access them
				const needsApproval = Number((fields as any)[ROLLUP_FIELD_IDS.needs_approval_count] || 0) > 0;
				const readyToPublish = Number((fields as any)[ROLLUP_FIELD_IDS.ready_to_publish_count] || 0) > 0;
				const scheduled = Number((fields as any)[ROLLUP_FIELD_IDS.scheduled_count] || 0) > 0;
				const hasPendingContent = needsApproval || readyToPublish || scheduled;

				return {
					id: record.id,
					client_name: clientName || '',
					status: normalisedStatus,
					original_status: normalisedStatus,
					has_pending_content: hasPendingContent,
					created_time: getField('created_time') || record.createdTime,
					platforms_requested: getField('platforms_requested') || [],
					strategy_summary: getField('strategy_summary') || '',
					// Use strategy_json (actual field name), fallback to strategy_payload for legacy records
					strategy_payload: getField('strategy_json') || getField('strategy_payload') || null,
					strategy_meta: getField('strategy_meta') || null,
					// Include rollup counts for UI display (access by field ID, default to 0 if missing)
					needs_approval_count: Number((fields as any)[ROLLUP_FIELD_IDS.needs_approval_count] || 0),
					ready_to_publish_count: Number((fields as any)[ROLLUP_FIELD_IDS.ready_to_publish_count] || 0),
					scheduled_count: Number((fields as any)[ROLLUP_FIELD_IDS.scheduled_count] || 0),
					published_count: Number((fields as any)[ROLLUP_FIELD_IDS.published_count] || 0),
				};
			});

			console.log(`[Brands API] Fetched ${profiles.length} brand profiles in 1 Airtable call`);
			return NextResponse.json({ profiles });
		} catch (error: any) {
			console.error('[Brands API] Airtable error:', error);
			
			// Check for billing limit error in error message
			const errorMessage = error?.message || '';
			const isBillingLimitError = 
				errorMessage.includes('PUBLIC_API_BILLING_LIMIT_EXCEEDED') ||
				errorMessage.includes('billing plan limit exceeded');
			
			if (isBillingLimitError) {
				console.error('[Brands API] Airtable billing limit exceeded - brand profiles exist but are temporarily inaccessible');
				return NextResponse.json(
					{ 
						error: 'Airtable API limit exceeded',
						message: 'Brand profiles are temporarily unavailable due to API usage limits. Please try again later or contact support.',
						billingLimitExceeded: true,
						profiles: []
					},
					{ status: 503 }
				);
			}
			
			return NextResponse.json(
				{ 
					error: errorMessage || 'Failed to fetch brand profiles',
					profiles: []
				},
				{ status: 422 }
			);
		}
	} catch (e: any) {
		console.error('Brands API error:', e);
		return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
	}
}

