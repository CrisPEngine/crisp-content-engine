# Creator Make Scenario - Platform Field Fix

## Issue

When the Creator Make scenario creates ContentQueue records, the **platform** field is not being populated correctly, especially for Blog posts. This causes content to appear under the wrong channel tab or not appear at all in the Content Approval queue.

## Root Cause

The Creator Make scenario (called via `MAKE_CONTENT_GENERATION_WEBHOOK_URL`) may not be setting the `platform` field when creating Airtable records for Blog content.

## Temporary Fix (App-Side)

The app now defaults empty `platform` values to `"Blog"` in the Content Queue API (`/api/content/queue/route.ts`):

```typescript
// Default platform to 'Blog' if empty (for Creator tier content where Make might not set it)
const platform = getField('platform', CONTENTQUEUE_FIELD_IDS.platform) || 'Blog';
```

This ensures that Creator tier content (especially Blog posts) will show up in the approval queue even if Make doesn't set the platform field.

## Permanent Fix (Make.com)

**In the Creator Make scenario:**

1. **Find the Airtable "Create Record" modules** (there should be one for LinkedIn and one for Blog).

2. **For each module, ensure the `platform` field is mapped:**
   - **LinkedIn module:** Set `platform` = `"LinkedIn"` (literal string)
   - **Blog module:** Set `platform` = `"Blog"` (literal string)

3. **Verify the field type in Airtable:**
   - Open ContentQueue table in Airtable.
   - Find the **platform** field.
   - Ensure it's **Single Select** or **Single Line Text**, **not** a linked record field.
   - If it's Single Select, the allowed options should include: `LinkedIn`, `X`, `Instagram`, `Facebook`, `Blog`, `Medium`.

## Testing

After fixing Make:

1. Approve a strategy on a **Creator** account.
2. Wait for the Creator Make scenario to run.
3. Check the ContentQueue table in Airtable - verify all records have a `platform` value.
4. Go to `/content/approval` in the app and verify content appears under the correct channel tabs.

## Additional Notes

- The **multichannel** scenario (for Growth/Pro/Scale) already handles platform correctly via routing (each channel route sets the platform explicitly).
- The app's default of `"Blog"` is a **fallback only** - Make should always set the platform field explicitly.
