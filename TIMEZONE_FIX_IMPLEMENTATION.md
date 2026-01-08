# Timezone Fix Implementation Summary

## Why This Is a "New Bug"

This bug likely started appearing recently due to one or more of these factors:

1. **Airtable Date Format Changes**: Airtable may have changed how it returns date values:
   - Previously: Always returned ISO strings (e.g., `"2026-08-01T05:30:00.000Z"`)
   - Recently: May return local format strings (e.g., `"8/1/2026 09:30"`) in some cases
   - This could happen when dates are entered manually or via formulas

2. **New Users with Non-UTC Timezones**: As the user base expanded to include users in timezones like:
   - Asia/Dubai (UTC+4)
   - Asia/Kolkata (UTC+5:30)
   - Other non-UTC timezones
   - The bug became more visible because UTC-only parsing fails for these users

3. **Data Entry Method Changes**: If users or Make.com scenarios started entering dates in local format instead of ISO, the old parsing logic would fail and default to "publish immediately" (returning `true` on parse failure)

4. **The Critical Flaw**: The old code had a **safety mechanism that backfired**:
   - Line 274: `return true; // If we can't parse, treat as due to avoid blocking`
   - Line 288: `return true; // If we can't parse, treat as due to avoid blocking`
   - This meant **any unparseable date would publish immediately**, causing early publishing

## What Was Fixed

### 1. Added Luxon Dependency
- Added `luxon` to `package.json` for proper timezone handling
- **Action Required**: Run `npm install` to install the dependency

### 2. Replaced `isContentDue()` Function
- **Before**: Used native `Date` which doesn't handle timezones properly
- **After**: Uses `luxon`'s `DateTime` for timezone-aware parsing
- **Key Changes**:
  - Parses ISO strings with timezone offsets correctly
  - Interprets local format strings (e.g., `"8/1/2026 09:30"`) in the user's timezone
  - **Returns `false` on parse failure** (prevents early publishing)
  - Removed the dangerous `Z` appending that forced UTC interpretation

### 3. Updated Function Call Site
- **Before**: `const isDue = isContentDue(scheduledTime);`
- **After**: 
  ```typescript
  const timezoneLookupValue = (fields as any)[LOOKUP_FIELD_IDS.timezone_lookup];
  const timezone = normalizeLookup(timezoneLookupValue) || null;
  const isDue = isContentDue(scheduledTime, timezone);
  ```
- Now retrieves and passes the user's timezone from the lookup field

### 4. Improved Error Handling
- Invalid or unparseable `scheduled_time` values now return `false` (not due)
- Logs warnings for unparseable dates instead of silently publishing
- Prevents posts from publishing early due to parsing errors

## How It Works Now

### Example: Dubai Timezone (UTC+4)

**User schedules**: `8/1/2026 09:30` in `Asia/Dubai`

1. Function receives: `scheduledTime = "8/1/2026 09:30"`, `timezone = "Asia/Dubai"`
2. ISO parse fails (not ISO format)
3. Tries local format parsing: `DateTime.fromFormat("8/1/2026 09:30", "M/d/yyyy HH:mm", { zone: "Asia/Dubai" })`
4. Converts to UTC: `2026-08-01T05:30:00.000Z` (09:30 Dubai = 05:30 UTC)
5. Compares: `now >= 2026-08-01T05:30:00.000Z`
6. **Result**: Only publishes when 05:30 UTC (09:30 Dubai) has passed ✅

### Example: ISO String with Timezone

**Airtable returns**: `"2026-08-01T09:30:00+04:00"`

1. Function receives: `scheduledTime = "2026-08-01T09:30:00+04:00"`, `timezone = "Asia/Dubai"`
2. ISO parse succeeds: `DateTime.fromISO()` recognizes the timezone offset
3. Converts to UTC: `2026-08-01T05:30:00.000Z`
4. Compares correctly ✅

### Example: Unparseable String

**Invalid format**: `"sometime tomorrow"`

1. Function receives: `scheduledTime = "sometime tomorrow"`, `timezone = "Asia/Dubai"`
2. ISO parse fails
3. Local format parsing fails (no matching format)
4. **Returns `false`** (not due)
5. Logs warning: `Unparseable scheduled_time: "sometime tomorrow"`
6. **Post does NOT publish** ✅

## Testing Checklist

After installing `luxon` (`npm install`), test these scenarios:

- [ ] Dubai timezone: `"8/1/2026 09:30"` in `Asia/Dubai` → converts to `05:30 UTC`
- [ ] India timezone: `"8/1/2026 14:30"` in `Asia/Kolkata` → converts to `09:00 UTC` (5:30 offset)
- [ ] US timezone: `"8/1/2026 09:30"` in `America/New_York` → converts correctly (negative offset)
- [ ] ISO with Z: `"2026-08-01T05:30:00.000Z"` → parses correctly
- [ ] ISO with offset: `"2026-08-01T09:30:00+04:00"` → parses correctly
- [ ] Unparseable string: `"invalid"` → returns `false`, does not publish
- [ ] Null/undefined: `null` → returns `true` (publish immediately)

## Next Steps

1. **Install dependency**: Run `npm install` to install `luxon`
2. **Deploy**: Deploy the updated code
3. **Monitor logs**: Watch for `[isContentDue]` log messages to verify correct parsing
4. **Data hygiene**: Ensure `scheduled_time` field in Airtable is a DateTime field (not text) to get consistent ISO strings

## Prevention

To prevent this from happening again:

1. **Always use DateTime fields** in Airtable (not text fields) for `scheduled_time`
2. **Store ISO strings** when setting `scheduled_time` programmatically
3. **Monitor logs** for `Unparseable scheduled_time` warnings
4. **Consider adding validation** in the UI to prevent invalid date formats from being saved

