# Airtable Content Brief Fields Update

## Required Airtable Field Additions

Add the following fields to the **StrategyUpdates** table (used for ContentBriefs):

### 1. `timezone`
- **Type**: Single select (or Text)
- **Options**: Match the timezone options from BrandProfiles table
- **Required**: No (for backward compatibility)
- **Description**: Timezone snapshot from BrandProfiles at brief creation time

### 2. `language_region`
- **Type**: Single select (or Text)
- **Options**: Match the language_region options from BrandProfiles table (e.g., "US English", "UK English", etc.)
- **Required**: No (for backward compatibility)
- **Description**: Language/region snapshot from BrandProfiles at brief creation time

## Implementation Details

### Backend Changes

1. **POST /api/content-brief** (`src/app/api/content-brief/route.ts`):
   - Fetches BrandProfiles record to verify ownership
   - Extracts `timezone` and `language_region` from BrandProfiles
   - Writes these fields to the ContentBrief (StrategyUpdates) record on creation

2. **triggerContentGenerationFromBrief** (`src/lib/contentBrief.ts`):
   - Reads `timezone` and `language_region` from the brief record (not BrandProfiles)
   - Includes these fields in the webhook payload sent to Make.com
   - Eliminates the need for Make.com to lookup BrandProfiles

### Webhook Payload Update

The Make.com webhook payload now includes:
```json
{
  "mode": "content_generation",
  "trigger_type": "content_brief_approved",
  "brief_id": "...",
  "timezone": "America/New_York",  // NEW: From brief snapshot
  "language_region": "US English",  // NEW: From brief snapshot
  ...
}
```

## Benefits

1. **No BrandProfiles Lookup in Make.com**: Make.com can use `timezone` and `language_region` directly from the webhook payload
2. **Snapshot Consistency**: Timezone and language are captured at brief creation time, ensuring consistency even if BrandProfiles changes later
3. **Performance**: Reduces API calls in Make.com scenario
4. **Traceability**: Brief records contain all necessary context for content generation

## Backward Compatibility

- Existing briefs without `timezone` or `language_region` will have empty strings
- Make.com should handle empty values gracefully (fallback to defaults if needed)
- The code includes fallback logic for older briefs

## Testing

1. Create a new content brief
2. Verify `timezone` and `language_region` are written to StrategyUpdates record
3. Approve the brief
4. Verify webhook payload includes `timezone` and `language_region` fields
5. Confirm Make.com can use these fields without BrandProfiles lookup
