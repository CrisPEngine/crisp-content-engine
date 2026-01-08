# Early Publish Bug Analysis

## Issue Summary

A post scheduled for **8/1/2026 09:30** in **Asia/Dubai (UTC+4)** was published at **8/1/2026 00:00** (midnight), approximately **9.5 hours early**.

## Root Cause

The `isContentDue()` function in `/src/app/api/publish/linkedin-due/route.ts` has a **critical timezone conversion bug**:

### Bug #1: Timezone Parameter Not Used
- **Line 230**: Function accepts `timezone` parameter: `function isContentDue(scheduledTime: string | null | undefined, timezone?: string | null)`
- **Line 397**: Function is called **without** the timezone: `const isDue = isContentDue(scheduledTime);`
- **Lines 237-267**: The function **never uses** the timezone parameter, even if it were passed

### Bug #2: Incorrect UTC Conversion
- **Line 256**: When parsing date strings like `"8/1/2026 09:30"`, the code appends `Z` (UTC):
  ```javascript
  scheduledDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`);
  ```
- This treats the time as **09:30 UTC** instead of **09:30 in the user's timezone**
- For Dubai (UTC+4), `09:30 Dubai` = `05:30 UTC`, but the code treats it as `09:30 UTC`
- **Result**: Posts publish 4 hours early (or more, depending on timezone offset)

### Bug #3: Timezone Data Not Retrieved
- **Line 349**: Timezone lookup field is fetched: `LOOKUP_FIELD_NAMES.timezone_lookup`
- **Line 397**: But the timezone value is **never retrieved** from the record before calling `isContentDue()`

## Example of the Bug

**Intended Schedule:**
- User schedules: `8/1/2026 09:30` in `Asia/Dubai` (UTC+4)
- Should publish at: `2026-08-01T05:30:00Z` (UTC)

**What Actually Happens:**
- Code parses: `"8/1/2026 09:30"` → `2026-08-01T09:30:00Z` (treats as UTC)
- Compares: `now >= 2026-08-01T09:30:00Z`
- **Problem**: This is 4 hours EARLIER than intended
- If cron runs at `2026-08-01T00:00:00Z` (midnight UTC), it sees `00:00 >= 09:30` = false
- But if the date string format causes parsing issues, it might publish even earlier

## Risk Assessment

### High Risk - Will Happen Again
This bug will affect **ALL posts scheduled in non-UTC timezones**:
- Any user with timezone ≠ UTC will experience early publishing
- The earlier the scheduled time, the more severe the early publish
- Timezones ahead of UTC (like Dubai +4, India +5:30) will publish hours early
- Timezones behind UTC (like US timezones) may publish on the wrong day

### Affected Scenarios
1. ✅ **Date strings without timezone** (e.g., `"8/1/2026 09:30"`) - **BROKEN**
2. ✅ **ISO strings without timezone** - **BROKEN** if not in UTC
3. ⚠️ **ISO strings with timezone** (e.g., `"2026-08-01T09:30:00+04:00"`) - May work if JavaScript Date handles it correctly, but timezone is still ignored

## Fix Required

1. **Retrieve timezone** from the lookup field in the record
2. **Pass timezone** to `isContentDue()` function
3. **Implement timezone conversion** in `isContentDue()` to convert scheduled time to UTC before comparison
4. **Handle timezone parsing** for date strings (don't assume UTC)

## Code Location

- **File**: `src/app/api/publish/linkedin-due/route.ts`
- **Function**: `isContentDue()` (lines 230-290)
- **Call site**: Line 397
- **Timezone lookup**: Line 349 (fetched but not used)

## Immediate Impact

- All scheduled posts in non-UTC timezones are at risk
- Users may see posts published hours or days early
- Could damage brand reputation if posts go live at wrong times
- May violate scheduling agreements with clients

