# Deployment Verification Checklist

## Recent Changes (Last 3 Major Updates)

### 1. Native LinkedIn Publishing Implementation ✅
**Commit:** `1e14b5c` and `8d6b65e`

**Files Changed:**
- ✅ `src/lib/linkedin/publish.ts` - LinkedIn publishing utilities
- ✅ `src/app/api/publish/linkedin-due/route.ts` - Scheduled publishing job
- ✅ `src/app/api/content/queue/[contentId]/route.ts` - Removed Make.com webhook
- ✅ `vercel.json` - Cron job configuration (15 minutes)

**Key Features:**
- ✅ Native LinkedIn publishing (no Make.com dependency)
- ✅ Scheduled job runs every 15 minutes
- ✅ Token refresh with permanent/transient error handling
- ✅ Idempotency key to prevent duplicate posts
- ✅ UTC timezone handling
- ✅ Uses Airtable view "ReadyToPublish_LinkedIn"
- ✅ Minimal field requests for performance

**Verification:**
```bash
# Check files exist
ls -la src/lib/linkedin/publish.ts
ls -la src/app/api/publish/linkedin-due/route.ts

# Check cron config
cat vercel.json | grep -A 3 crons
```

### 2. Content Management Enhancements ✅
**Commit:** `de29b45` and `0458d4e`

**Files Changed:**
- ✅ `src/app/api/content/queue/route.ts` - Added content_type field, stage=all support
- ✅ `src/app/(app)/content/approval/page.tsx` - Enhanced UI with scheduled times
- ✅ `src/components/DashboardTabs.tsx` - New dashboard tab component
- ✅ `src/app/(app)/dashboard/page.tsx` - Tab system integration

**Key Features:**
- ✅ content_type field support (Post, Article, Carousel, etc.)
- ✅ Enhanced content approval page with status badges
- ✅ Dashboard tabs (Overview and Content)
- ✅ Content schedule overview on dashboard
- ✅ API supports stage=all for fetching all content

**Verification:**
```bash
# Check files exist
ls -la src/components/DashboardTabs.tsx
grep -n "content_type" src/app/api/content/queue/route.ts
grep -n "stage=all" src/app/api/content/queue/route.ts
```

### 3. Strategy Review Page Redesign ✅
**Commit:** `df643e7`

**Files Changed:**
- ✅ `src/app/(app)/strategy/[id]/page.tsx` - Complete UI redesign

**Key Features:**
- ✅ Strategy Header Card with gradient background
- ✅ Info banner (centered, subtle styling)
- ✅ Strategy Snapshot card (pillars, audience, voice, cadence)
- ✅ Section header for Strategy Content
- ✅ Improved visual hierarchy

**Verification:**
```bash
# Check file
grep -n "Strategy Header Card" src/app/(app)/strategy/[id]/page.tsx
grep -n "Strategy Snapshot" src/app/(app)/strategy/[id]/page.tsx
```

## Git Status Verification

All commits are pushed to GitHub:
- ✅ `df643e7` - Strategy Review redesign
- ✅ `17bff48` - Trigger deployment
- ✅ `0458d4e` - stage=all support
- ✅ `de29b45` - Content management enhancements
- ✅ `8d6b65e` - LinkedIn publishing optimizations
- ✅ `1e14b5c` - Native LinkedIn publishing

## Vercel Deployment

### Manual Deployment Trigger

If Vercel hasn't auto-deployed, you can:

1. **Via Vercel Dashboard:**
   - Go to your Vercel project
   - Click "Deployments" tab
   - Click "Redeploy" on the latest deployment
   - Or click "Create Deployment" → Select branch `main`

2. **Via Vercel CLI:**
   ```bash
   vercel --prod
   ```

3. **Trigger via Git:**
   ```bash
   git commit --allow-empty -m "Trigger Vercel deployment" && git push
   ```

### Environment Variables Required

Make sure these are set in Vercel:
- `AIRTABLE_PAT`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_CONTENTQUEUE_TABLE`
- `AIRTABLE_BRANDPROFILES_TABLE`
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_ENCRYPTION_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`

### Cron Job Setup

The cron job is configured in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/publish/linkedin-due",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

**Note:** Vercel Cron requires:
- Vercel Pro plan or higher
- Or use external cron service (cron-job.org, EasyCron, etc.)

## Testing After Deployment

1. **LinkedIn Publishing:**
   - Approve content in approval queue
   - Check Airtable status changes to "Ready To Publish"
   - Wait for cron job (15 min) or manually call `/api/publish/linkedin-due`
   - Verify content publishes to LinkedIn

2. **Dashboard Tabs:**
   - Navigate to `/dashboard`
   - Click "Content" tab
   - Verify content list appears
   - Check scheduled times display correctly

3. **Strategy Review Page:**
   - Navigate to `/strategy/[id]` for approved strategy
   - Verify header card with gradient appears
   - Check Strategy Snapshot card shows data
   - Verify info banner is centered

4. **Content Approval Page:**
   - Navigate to `/content/approval`
   - Verify status badges appear
   - Check scheduled times are prominent
   - Verify content_type badges show

## Files Summary

**New Files Created:**
- `src/lib/linkedin/publish.ts`
- `src/app/api/publish/linkedin-due/route.ts`
- `src/components/DashboardTabs.tsx`
- `LINKEDIN_PUBLISHING_SETUP.md`
- `CONTENT_PUBLISHING_WORKFLOW.md`

**Files Modified:**
- `src/app/api/content/queue/[contentId]/route.ts` - Removed Make.com webhook
- `src/app/api/content/queue/route.ts` - Added content_type, stage=all
- `src/app/(app)/content/approval/page.tsx` - Enhanced UI
- `src/app/(app)/dashboard/page.tsx` - Added tabs
- `src/app/(app)/strategy/[id]/page.tsx` - Complete redesign
- `vercel.json` - Added cron configuration

