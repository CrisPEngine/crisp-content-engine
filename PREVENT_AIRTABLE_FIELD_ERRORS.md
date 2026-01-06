# How to Prevent Airtable Field Name Errors

## The Problem

When using `returnFieldsByFieldId=true` in Airtable API calls, **ALL fields** in the response are keyed by **field IDs**, not field names. However, the `fields[]` parameter in requests must use **field names**.

This creates a mismatch:
- **Request**: Use field **names** (e.g., `'post_content'`, `'hook'`)
- **Response**: Fields are keyed by **IDs** (e.g., `'fldxVHLUkrlcxx7Ua'`, `'fld...'`)

## Common Errors

1. **`UNKNOWN_FIELD_NAME`**: Requesting a field that doesn't exist in Airtable
   - Example: `Unknown field name: "content"` (should be `"post_content"`)
   - **Fix**: Only request fields that actually exist in your Airtable table

2. **Empty/Missing Field Values**: Accessing fields by name when `returnFieldsByFieldId=true`
   - Example: `fields.post_content` returns `undefined` even though the field exists
   - **Fix**: Access fields by ID, or use the `getField()` helper function

## Solution: Use Field ID Mapping

### Step 1: Get Field IDs from Airtable

For each field you need to access:

1. Go to your Airtable base
2. Open the table (e.g., ContentQueue)
3. Click **"Manage fields"** (top right)
4. Find the field you need
5. Copy the **Field ID** (starts with `fld...`)
6. Note the **Field Name** (exact spelling, case-sensitive)

### Step 2: Create Field ID Mapping

Add field IDs to the appropriate mapping file:

**For ContentQueue fields** (used in `/api/publish/linkedin-due` and `/api/content/queue`):
- Add to `CONTENTQUEUE_FIELD_IDS` in `src/app/api/publish/linkedin-due/route.ts`
- Or create a shared mapping in `src/lib/airtable/field-mapping.ts`

**For lookup/rollup fields**:
- Already mapped in `src/lib/airtable/field-mapping.ts`

### Step 3: Use the `getField()` Helper

Always use the `getField()` helper function to access fields:

```typescript
// ❌ WRONG - Direct field access (won't work with returnFieldsByFieldId=true)
const body = fields.post_content || '';

// ✅ CORRECT - Use getField helper
const getField = (fieldName: string, fieldId?: string) => getFieldValue(fields, fieldId, fieldName);
const body = getField('post_content', CONTENTQUEUE_FIELD_IDS.post_content) || '';
```

### Step 4: Verify Field Names in Requests

When building the `fields[]` array for `listRecords()`, **only include fields that exist**:

```typescript
// ❌ WRONG - Requesting non-existent field
fields: [
  'post_content',
  'content', // This field doesn't exist!
  'hook',
]

// ✅ CORRECT - Only request existing fields
fields: [
  'post_content', // This exists
  'hook',        // This exists
  // Don't include 'content' - it doesn't exist
]
```

## Current Field Mappings

### ContentQueue Fields (Known IDs)

| Field Name | Field ID | Used In |
|------------|----------|---------|
| `brand_profile_id` | `fldqCh274V2Ih2PPS` | `/api/publish/linkedin-due` |
| `post_content` | `fldxVHLUkrlcxx7Ua` | `/api/publish/linkedin-due` |

### ContentQueue Lookup Fields

Already mapped in `src/lib/airtable/field-mapping.ts`:
- `brand_name_lookup`: `fldDHJ0Rx7Rbzlu4a`
- `user_id_lookup`: `fldXszK9zI99mukqB`
- `timezone_lookup`: `fldekIgjL6u1GnLbo`
- `language_region_lookup`: `fldflM0OxGiaxwVMt`
- `spelling_variant_lookup`: `fldA4YS26SIbZd7Xs`

## How to Add New Field IDs

1. **Get the Field ID** from Airtable (see Step 1 above)

2. **Add to mapping**:
   ```typescript
   const CONTENTQUEUE_FIELD_IDS = {
     brand_profile_id: 'fldqCh274V2Ih2PPS',
     post_content: 'fldxVHLUkrlcxx7Ua',
     // Add new field here:
     hook: 'fldYOUR_FIELD_ID_HERE',
   } as const;
   ```

3. **Update field access**:
   ```typescript
   const title = getField('hook', CONTENTQUEUE_FIELD_IDS.hook) || '';
   ```

## Testing Checklist

Before deploying changes that access Airtable fields:

- [ ] Verify all field names in `fields[]` array exist in Airtable
- [ ] Use `getField()` helper for all field accesses when `returnFieldsByFieldId=true`
- [ ] Add field IDs to mapping for fields accessed in response
- [ ] Test the endpoint to ensure fields are returned correctly
- [ ] Check Vercel logs for any `UNKNOWN_FIELD_NAME` errors

## Quick Reference

**Request fields**: Use **field names** (e.g., `'post_content'`, `'hook'`)
**Access fields**: Use **field IDs** via `getField()` helper (e.g., `getField('post_content', 'fldxVHLUkrlcxx7Ua')`)

## Files to Update When Adding Fields

1. **`src/app/api/publish/linkedin-due/route.ts`**: Add to `CONTENTQUEUE_FIELD_IDS`
2. **`src/app/api/content/queue/route.ts`**: Use `getField()` helper
3. **`src/lib/airtable/field-mapping.ts`**: Add lookup/rollup fields here

## Summary

**To prevent field errors:**
1. ✅ Only request fields that exist in Airtable
2. ✅ Use `getField()` helper when `returnFieldsByFieldId=true`
3. ✅ Add field IDs to mapping for fields you access
4. ✅ Test endpoints after changes
5. ✅ Check logs for `UNKNOWN_FIELD_NAME` errors

**The key rule**: When `returnFieldsByFieldId=true`, **ALL fields** in the response are keyed by IDs, not names. Always use the `getField()` helper to access them safely.
