# Airtable Billing Limit Exceeded - Troubleshooting Guide

## Issue Summary

When users see "No brand profiles yet" on the dashboard, but brand profiles were previously created, this is typically caused by the **Airtable API billing limit being exceeded**.

**Important**: Brand profiles are NOT lost - they still exist in Airtable. They're just temporarily inaccessible due to API rate limits.

## How to Verify

### 1. Check Vercel Logs

Look for errors like:
```
Airtable error: {
  errors: [
    {
      error: 'PUBLIC_API_BILLING_LIMIT_EXCEEDED',
      message: "API billing plan limit exceeded. You've reached the maximum number of requests allowed for this month."
    }
  ]
}
```

### 2. Check Airtable Dashboard

1. Go to [Airtable Dashboard](https://airtable.com)
2. Navigate to **Workspace Settings** → **Usage & Billing**
3. Check your current API usage vs. plan limits
4. Look at the **API requests** section to see usage

### 3. Check Application Logs

The application now logs billing limit errors with:
- `[Brands API] Airtable billing limit exceeded - brand profiles exist but are temporarily inaccessible`
- `[Dashboard] Airtable billing limit exceeded - brand profiles exist but are temporarily inaccessible`

## Solutions

### Immediate Fix: Wait for Reset

Airtable API limits reset monthly. If you're on a free plan:
- **Free Plan**: 5 requests per second, 1,000 requests per month
- Limits reset at the start of each billing cycle

**Action**: Wait until the next billing cycle, or upgrade your Airtable plan.

### Upgrade Airtable Plan

1. Go to Airtable Dashboard → **Workspace Settings** → **Usage & Billing**
2. Click **Upgrade** or **Change Plan**
3. Choose a plan with higher API limits:
   - **Plus Plan**: 5 requests/second, 5,000 requests/month
   - **Pro Plan**: 10 requests/second, 50,000 requests/month
   - **Enterprise**: Custom limits

### Reduce API Calls (Long-term)

The application makes multiple Airtable API calls. To reduce usage:

1. **Cache responses** where possible (already implemented for some endpoints)
2. **Batch requests** when fetching multiple records
3. **Optimize queries** to fetch only needed fields
4. **Monitor usage** in Airtable dashboard

### Check Current Usage

To see how many API calls you're making:

1. Go to Airtable Dashboard
2. **Workspace Settings** → **Usage & Billing**
3. Scroll to **API Usage**
4. Review:
   - Requests per second
   - Requests this month
   - Peak usage times

## User Experience

### Before Fix

- Users see "No brand profiles yet"
- No indication that data is safe
- Users may think data is lost

### After Fix

- Users see: "Brand profiles temporarily unavailable"
- Clear message: "Your brand profiles are safe and haven't been lost"
- Explanation: "Temporarily inaccessible due to API usage limits"
- "Retry" button to check again
- Helpful guidance to contact support if it persists

## Code Changes Made

1. **`/api/brands/route.ts`**:
   - Detects `PUBLIC_API_BILLING_LIMIT_EXCEEDED` error
   - Returns `503 Service Unavailable` with `billingLimitExceeded: true` flag
   - Returns empty `profiles` array so UI doesn't break

2. **`/app/(app)/dashboard/page.tsx`**:
   - Detects billing limit errors in server-side fetch
   - Logs helpful error message
   - Continues with empty array (graceful degradation)

3. **`BrandProfilesList.tsx`**:
   - Shows special message when `billingLimitExceeded` is true
   - Displays "Brand profiles temporarily unavailable" instead of "No brand profiles yet"
   - Includes "Retry" button
   - Reassures users that data is safe

## Monitoring

### Set Up Alerts

Consider setting up alerts for:
- Airtable API errors in Vercel logs
- High API usage approaching limits
- Multiple users reporting missing brand profiles

### Check Regularly

- Monitor Airtable usage dashboard weekly
- Review Vercel logs for API errors
- Track user reports of missing data

## Prevention

1. **Upgrade Airtable Plan**: If you're consistently hitting limits
2. **Optimize API Calls**: Reduce unnecessary requests
3. **Add Caching**: Cache brand profiles for a few minutes
4. **Rate Limiting**: Implement client-side rate limiting
5. **Fallback Data**: Consider storing brand profile metadata in Supabase as backup

## Support Response

When users report missing brand profiles:

1. **Check Vercel logs** for `PUBLIC_API_BILLING_LIMIT_EXCEEDED` errors
2. **Verify in Airtable** that profiles still exist
3. **Check Airtable usage** to confirm limit exceeded
4. **Reassure user** that data is safe
5. **Provide timeline** for when limits reset
6. **Suggest upgrade** if this happens frequently

## Quick Diagnostic Commands

```bash
# Check recent Vercel logs for Airtable errors
vercel logs --follow | grep -i "billing\|airtable\|PUBLIC_API"

# Or check in Vercel Dashboard:
# Project → Logs → Filter by "Airtable" or "billing"
```

## Related Files

- `src/app/api/brands/route.ts` - Brands API endpoint
- `src/app/(app)/dashboard/page.tsx` - Dashboard server component
- `src/components/BrandProfilesList.tsx` - Brand profiles list component
