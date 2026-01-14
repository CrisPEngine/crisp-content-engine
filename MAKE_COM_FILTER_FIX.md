# Make.com Filter Fix for Content Brief Processing

## Problem

The Make.com filter is blocking new content briefs from being processed. The filter logic is:

```
status != "Sent to Make" 
OR 
(status = "Sent to Make" AND sent_to_make_at < 30 minutes ago)
```

**Issue**: When a brief is approved, the API sets:
- `status = "Sent to Make"`
- `sent_to_make_at = now()` (current timestamp)

This means:
- The first condition fails (status IS "Sent to Make")
- The second condition fails (sent_to_make_at is NOW, not 30 minutes ago)
- **Result**: Bundle doesn't pass through the filter!

## Solution

Update the Make.com filter to allow newly sent briefs. The filter should be:

```
status != "Sent to Make" 
OR 
(status = "Sent to Make" AND sent_to_make_at >= addMinutes(now(); -5))
```

This allows:
1. Briefs that haven't been sent yet (status != "Sent to Make")
2. Briefs that were sent within the last 5 minutes (to allow new sends)
3. Briefs that were sent more than 30 minutes ago (to retry stuck ones)

## Alternative Solution (Recommended)

Change the filter to check for "Approved" status instead, since we set status to "Approved" BEFORE calling Make.com:

```
status = "Approved"
```

This is simpler and more reliable because:
- Briefs are set to "Approved" before the webhook is called
- Make.com processes them
- Make.com then updates status to "Sent to Make" after processing
- This prevents duplicate processing naturally

## Implementation Steps

1. **Option A (Recommended)**: Update Make.com filter to `status = "Approved"`
   - This matches the status set by `/api/content-brief/[id]/approve`
   - Make.com should update status to "Sent to Make" after processing

2. **Option B**: Update filter to allow recent "Sent to Make" records:
   ```
   status != "Sent to Make" 
   OR 
   (status = "Sent to Make" AND sent_to_make_at >= addMinutes(now(); -5))
   OR
   (status = "Sent to Make" AND sent_to_make_at < addMinutes(now(); -30))
   ```

## Current Flow

1. User approves brief → Status set to "Approved"
2. API calls `triggerContentGenerationFromBrief()`
3. Status updated to "Sent to Make" + `sent_to_make_at = now()`
4. Webhook sent to Make.com
5. **Make.com filter blocks it** ❌

## Fixed Flow (Option A)

1. User approves brief → Status set to "Approved"
2. API calls `triggerContentGenerationFromBrief()`
3. Webhook sent to Make.com (status still "Approved")
4. **Make.com filter allows it** ✅
5. Make.com processes and updates status to "Sent to Make"

## Fixed Flow (Option B)

1. User approves brief → Status set to "Approved"
2. API calls `triggerContentGenerationFromBrief()`
3. Status updated to "Sent to Make" + `sent_to_make_at = now()`
4. Webhook sent to Make.com
5. **Make.com filter allows it** (because sent_to_make_at is within last 5 minutes) ✅
6. Make.com processes

