/**
 * Airtable Field ID to Field Name Mapping
 * 
 * IMPORTANT: Airtable API requires FIELD NAMES in the fields[] parameter,
 * but we can use returnFieldsByFieldId=true to get responses keyed by field IDs.
 * 
 * This mapping allows us to:
 * 1. Use field names for selection (fields[] parameter)
 * 2. Use field IDs for response keys (returnFieldsByFieldId=true)
 * 3. Maintain stability if field names change
 */

/**
 * ContentQueue Lookup Fields
 * Field IDs are immutable, field names may change
 * 
 * TO GET ACTUAL FIELD NAMES:
 * 1. Go to Airtable > ContentQueue table
 * 2. Click "Manage fields" (top right)
 * 3. Find the field with the matching Field ID
 * 4. The "Name" column shows the actual field name
 * 5. Update the 'name' property below with the actual name
 * 
 * IMPORTANT: Field names in Airtable are case-sensitive and may contain spaces.
 * Use the exact name as shown in Airtable.
 */
export const CONTENTQUEUE_LOOKUP_FIELDS = {
	// Field ID -> Field Name mapping
	brand_name_lookup: {
		id: 'fldDHJ0Rx7Rbzlu4a',
		name: 'brand_name_lookup', // TODO: Replace with actual field name from Airtable UI
	},
	user_id_lookup: {
		id: 'fldXszK9zI99mukqB',
		name: 'user_id_lookup', // TODO: Replace with actual field name from Airtable UI
	},
	timezone_lookup: {
		id: 'fldekIgjL6u1GnLbo',
		name: 'timezone_lookup', // TODO: Replace with actual field name from Airtable UI
	},
	language_region_lookup: {
		id: 'fldflM0OxGiaxwVMt',
		name: 'language_region_lookup', // TODO: Replace with actual field name from Airtable UI
	},
	spelling_variant_lookup: {
		id: 'fldA4YS26SIbZd7Xs',
		name: 'spelling_variant_lookup', // TODO: Replace with actual field name from Airtable UI
	},
} as const;

/**
 * BrandProfiles Rollup Fields
 * Field IDs are immutable, field names may change
 * 
 * TO GET ACTUAL FIELD NAMES:
 * 1. Go to Airtable > BrandProfiles table
 * 2. Click "Manage fields" (top right)
 * 3. Find the field with the matching Field ID
 * 4. The "Name" column shows the actual field name
 * 5. Update the 'name' property below with the actual name
 * 
 * IMPORTANT: Field names in Airtable are case-sensitive and may contain spaces.
 * Use the exact name as shown in Airtable.
 */
export const BRANDPROFILES_ROLLUP_FIELDS = {
	needs_approval_count: {
		id: 'fldoVhwdnORrAzGte',
		name: 'needs_approval_count', // TODO: Replace with actual field name from Airtable UI
	},
	ready_to_publish_count: {
		id: 'fldlwGSMBUH7OPbjM',
		name: 'is_ready_to_publish_count', // Actual field name from Airtable
	},
	scheduled_count: {
		id: 'fldbmS3KCkSmUw5vn',
		name: 'scheduled_count', // TODO: Replace with actual field name from Airtable UI
	},
	published_count: {
		id: 'fldWwrVyniwGMCS7z',
		name: 'published_count', // TODO: Replace with actual field name from Airtable UI
	},
} as const;

/**
 * Get field name from field ID (for use in fields[] parameter)
 */
export function getFieldName(fieldId: string): string | null {
	// Check ContentQueue lookups
	for (const [key, value] of Object.entries(CONTENTQUEUE_LOOKUP_FIELDS)) {
		if (value.id === fieldId) {
			return value.name;
		}
	}
	
	// Check BrandProfiles rollups
	for (const [key, value] of Object.entries(BRANDPROFILES_ROLLUP_FIELDS)) {
		if (value.id === fieldId) {
			return value.name;
		}
	}
	
	return null;
}

/**
 * Get field ID from field name (for use in response parsing)
 */
export function getFieldId(fieldName: string): string | null {
	// Check ContentQueue lookups
	for (const [key, value] of Object.entries(CONTENTQUEUE_LOOKUP_FIELDS)) {
		if (value.name === fieldName || key === fieldName) {
			return value.id;
		}
	}
	
	// Check BrandProfiles rollups
	for (const [key, value] of Object.entries(BRANDPROFILES_ROLLUP_FIELDS)) {
		if (value.name === fieldName || key === fieldName) {
			return value.id;
		}
	}
	
	return null;
}
