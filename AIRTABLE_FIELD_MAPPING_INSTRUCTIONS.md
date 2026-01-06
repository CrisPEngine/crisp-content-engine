# Airtable Field Mapping Instructions

## Overview

The codebase now uses a field mapping system that:
1. **Uses field NAMES** in the `fields[]` parameter (Airtable API requirement)
2. **Uses `returnFieldsByFieldId=true`** to get responses keyed by field IDs (for stability)
3. **Accesses lookup/rollup fields by field ID** in the response

## Critical: Update Field Names

The field mapping file (`src/lib/airtable/field-mapping.ts`) currently has placeholder field names. **You must update these with the actual field names from your Airtable base.**

### How to Get Field Names

1. **For ContentQueue Lookup Fields:**
   - Go to Airtable → ContentQueue table
   - Click "Manage fields" (top right)
   - Find each field by its Field ID:
     - `fldDHJ0Rx7Rbzlu4a` → Get the "Name" column value
     - `fldXszK9zI99mukqB` → Get the "Name" column value
     - `fldekIgjL6u1GnLbo` → Get the "Name" column value
     - `fldflM0OxGiaxwVMt` → Get the "Name" column value
     - `fldA4YS26SIbZd7Xs` → Get the "Name" column value
   - Update the `name` property in `CONTENTQUEUE_LOOKUP_FIELDS`

2. **For BrandProfiles Rollup Fields:**
   - Go to Airtable → BrandProfiles table
   - Click "Manage fields" (top right)
   - Find each field by its Field ID:
     - `fldoVhwdnORrAzGte` → Get the "Name" column value
     - `fldlwGSMBUH7OPbjM` → Get the "Name" column value
     - `fldbmS3KCkSmUw5vn` → Get the "Name" column value
     - `fldWwrVyniwGMCS7z` → Get the "Name" column value
   - Update the `name` property in `BRANDPROFILES_ROLLUP_FIELDS`

### Important Notes

- **Field names are case-sensitive** - use exact case as shown in Airtable
- **Field names may contain spaces** - include spaces exactly as shown
- **Field names may differ from IDs** - don't assume the name matches the ID pattern

## How It Works

### Request (fields[] parameter)
```typescript
// Uses field NAMES (required by Airtable API)
fields: [
  'platform',
  'status',
  LOOKUP_FIELD_NAMES.user_id_lookup, // Field name, not ID
]
```

### Response (with returnFieldsByFieldId=true)
```typescript
// Responses are keyed by field IDs
const userId = fields[LOOKUP_FIELD_IDS.user_id_lookup]; // Access by ID
```

## Filter Formulas

Filter formulas also use **field names**, not IDs:

```typescript
// Correct: Use field name in formula
filterByFormula: `FIND("${userId}", ARRAYJOIN({${LOOKUP_FIELD_NAMES.user_id_lookup}}, ",")) > 0`

// Wrong: Don't use field ID in formula
filterByFormula: `FIND("${userId}", {${LOOKUP_FIELD_IDS.user_id_lookup}}) > 0` // ❌
```

## Testing

After updating field names:

1. Test `/api/brands` endpoint - should return rollup counts
2. Test `/api/content/queue` endpoint - should filter by user correctly
3. Test `/api/publish/linkedin-due` endpoint - should find user_id from lookup
4. Check `/api/admin/airtable-stats` for API call reduction metrics

## API Call Tracking

The client now logs all API calls. View stats at:
- `/api/admin/airtable-stats` - Overall stats
- `/api/admin/airtable-stats?endpoint=/api/brands` - Per-endpoint stats

Stats include:
- Total calls
- Cached calls (didn't hit API)
- Coalesced calls (deduplicated)
- Actual API calls made
