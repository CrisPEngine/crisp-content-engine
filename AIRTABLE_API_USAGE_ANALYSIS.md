# Airtable API Usage Analysis

## Overview

This document analyzes how many and how often we make API calls to Airtable, helping identify why billing limits might be exceeded.

## API Call Categories

### 1. User-Initiated Calls (On Page Load/Action)

#### Dashboard Page Load
- **Frequency**: Every time user visits dashboard
- **Calls**: 
  - 1 call: Fetch brand profiles for user
  - 1 call: Fetch content queue (which also fetches brand profiles again)
- **Total per dashboard visit**: ~2-3 calls
- **Estimated**: If 10 users visit dashboard 5x/day = **50-75 calls/day**

#### Brands API (`/api/brands`)
- **Frequency**: Called on multiple pages
- **Calls per request**:
  - 1 call: Fetch brand profiles
  - 1-10 calls: Check content status for each brand (batched in groups of 10)
- **Pages that call it**:
  - Dashboard (server-side + client-side)
  - Content Brief page
  - Strategy page
  - Monthly Update page
  - Connections/Assign Brand page
- **Total per user session**: ~2-5 calls
- **Estimated**: If 10 users browse 3 pages = **60-150 calls/day**

#### Content Queue API (`/api/content/queue`)
- **Frequency**: Called on dashboard, content approval page
- **Calls per request**:
  - 1 call: Fetch user's brand profiles (to filter content)
  - 1 call: Fetch content records
  - 1-10 calls: Fetch brand names (batched in groups of 10)
- **Total per request**: ~3-12 calls
- **Estimated**: If 10 users check content 2x/day = **60-240 calls/day**

#### Strategy Pages
- **Frequency**: When viewing/editing strategy
- **Calls per page load**:
  - 1 call: Fetch brand profile
  - 1 call: Fetch strategy data
- **Estimated**: If 5 users view strategy 2x/day = **20 calls/day**

#### Admin Dashboard
- **Frequency**: When admin views user details
- **Calls per user viewed**:
  - 1 call: Fetch brand profiles
  - 1 call: Fetch content count
  - 1 call: Fetch content briefs
- **Estimated**: If admin views 20 users/day = **60 calls/day**

### 2. Scheduled/Cron Jobs

#### LinkedIn Publishing Job (`/api/publish/linkedin-due`)
- **Frequency**: Every 15 minutes (if using cron-job.org)
- **Calls per execution**:
  - 1 call: Fetch all "Ready To Publish" LinkedIn posts
  - 1 call per post: Fetch brand profile (to get user_id)
  - 1 call per post: Update post status after publishing
- **Example**: If 10 posts need publishing = **1 + 10 + 10 = 21 calls**
- **Daily calls**: 96 executions × average 5 posts = **~480-960 calls/day**

#### Content Approval Reminder (`/api/email/content-approval-reminder`)
- **Frequency**: Every 3-6 hours
- **Calls per execution**:
  - 1 call: Fetch content needing approval
  - 1 call per user: Fetch brand profiles (for email context)
- **Daily calls**: 4-8 executions × 5 users = **20-40 calls/day**

#### Strategy Reminder (`/api/email/strategy-reminder`)
- **Frequency**: Daily
- **Calls per execution**:
  - 1 call per user: Fetch brand profiles
- **Daily calls**: 1 execution × 10 users = **10 calls/day**

### 3. Webhook Callbacks

#### Content Generation Webhook (`/api/content/webhook`)
- **Frequency**: When Make.com completes content generation
- **Calls per webhook**:
  - 1 call: Fetch content brief
  - 1-100 calls: Verify generated content exists (batched)
  - 1 call: Update brief status
- **Estimated**: If 5 briefs/day generate 20 posts each = **~105 calls/day**

#### Strategy Webhook (`/api/strategy/webhook`)
- **Frequency**: When Make.com completes strategy generation
- **Calls per webhook**:
  - 1 call: Update strategy record
- **Estimated**: If 2 strategies/day = **2 calls/day**

### 4. User Actions (On-Demand)

#### Create Brand Profile (`/api/onboarding`)
- **Frequency**: When user completes onboarding
- **Calls**: 1 call to create record
- **Estimated**: If 2 new users/day = **2 calls/day**

#### Create Content Brief (`/api/content-brief`)
- **Frequency**: When user submits monthly brief
- **Calls**:
  - 1 call: Verify brand profile
  - 1 call: Fetch recent posts (for best/worst)
  - 1 call: Create brief record
- **Estimated**: If 3 briefs/day = **9 calls/day**

#### Approve Content Brief (`/api/content-brief/[id]/approve`)
- **Frequency**: When user approves brief
- **Calls**:
  - 1 call: Fetch brief
  - 1 call: Update brief status
- **Estimated**: If 3 approvals/day = **6 calls/day**

#### Content Actions (`/api/content/queue/[contentId]`)
- **Frequency**: When user edits/approves/publishes content
- **Calls per action**:
  - 1 call: Fetch content record
  - 1 call: Update content record
- **Estimated**: If 20 content actions/day = **40 calls/day**

#### Strategy Actions (`/api/strategy/[id]`)
- **Frequency**: When user views/edits strategy
- **Calls per action**:
  - 1 call: Fetch strategy
  - 1 call: Update strategy (on save)
- **Estimated**: If 10 strategy edits/day = **20 calls/day**

## Total Daily Estimate

### Conservative Estimate (10 active users)
- **User-initiated**: ~200-500 calls/day
- **Scheduled jobs**: ~500-1,000 calls/day
- **Webhooks**: ~110 calls/day
- **User actions**: ~80 calls/day
- **Total**: **~900-1,700 calls/day**

### Moderate Estimate (20 active users)
- **User-initiated**: ~400-1,000 calls/day
- **Scheduled jobs**: ~500-1,000 calls/day
- **Webhooks**: ~110 calls/day
- **User actions**: ~160 calls/day
- **Total**: **~1,200-2,300 calls/day**

### High Estimate (50 active users)
- **User-initiated**: ~1,000-2,500 calls/day
- **Scheduled jobs**: ~500-1,000 calls/day
- **Webhooks**: ~110 calls/day
- **User actions**: ~400 calls/day
- **Total**: **~2,000-4,000 calls/day**

## Monthly Totals

- **Conservative**: ~27,000-51,000 calls/month
- **Moderate**: ~36,000-69,000 calls/month
- **High**: ~60,000-120,000 calls/month

## Airtable Plan Limits

- **Free Plan**: 1,000 requests/month ❌ **EXCEEDED**
- **Plus Plan**: 5,000 requests/month ⚠️ **Likely exceeded**
- **Pro Plan**: 50,000 requests/month ✅ **Should be fine**
- **Enterprise**: Custom limits ✅

## High-Volume Call Sources

### 1. Publishing Job (Highest Volume)
- **Issue**: Runs every 15 minutes
- **Calls**: 1 fetch + N brand lookups + N updates (where N = posts to publish)
- **Optimization**: 
  - Cache brand profile lookups
  - Batch updates where possible
  - Reduce frequency if not needed

### 2. Content Queue API
- **Issue**: Fetches brand profiles + content + brand names separately
- **Calls**: 3-12 calls per request
- **Optimization**:
  - Combine queries where possible
  - Cache brand profiles for a few minutes
  - Use single query with all needed fields

### 3. Brands API
- **Issue**: Fetches content status separately for each brand
- **Calls**: 1 + (N brands / 10) calls
- **Optimization**:
  - Cache content status checks
  - Reduce frequency of status checks
  - Combine into single query if possible

## Optimization Recommendations

### Immediate (High Impact)

1. **Add Caching for Brand Profiles**
   - Cache brand profiles for 5-10 minutes
   - Reduces duplicate fetches on same page
   - **Potential savings**: 30-50% reduction

2. **Reduce Publishing Job Frequency**
   - Change from every 15 minutes to every 30-60 minutes
   - Most posts don't need to publish immediately
   - **Potential savings**: 50% reduction in publishing calls

3. **Batch Brand Name Lookups**
   - Already batching in groups of 10, but could optimize further
   - Cache brand names for longer periods
   - **Potential savings**: 20-30% reduction

### Medium-Term (Medium Impact)

4. **Combine API Calls**
   - Fetch brand profiles + content in single query where possible
   - Use Airtable views to pre-filter data
   - **Potential savings**: 10-20% reduction

5. **Optimize Content Queue**
   - Fetch only needed fields
   - Use pagination more effectively
   - **Potential savings**: 15-25% reduction

6. **Cache Strategy Data**
   - Strategy data rarely changes
   - Cache for 1-5 minutes
   - **Potential savings**: 10-15% reduction

### Long-Term (Lower Impact)

7. **Move Frequently-Accessed Data to Supabase**
   - Store brand profile metadata in Supabase
   - Only query Airtable when needed
   - **Potential savings**: 20-40% reduction

8. **Implement Request Deduplication**
   - Prevent duplicate simultaneous requests
   - Use request queuing
   - **Potential savings**: 5-10% reduction

## Monitoring

### How to Track Usage

1. **Airtable Dashboard**:
   - Go to Workspace Settings → Usage & Billing
   - Check "API Usage" section
   - Monitor daily/weekly trends

2. **Application Logs**:
   - Add logging to count Airtable calls
   - Track by endpoint/function
   - Set up alerts for high usage

3. **Vercel Logs**:
   - Search for "api.airtable.com" in logs
   - Count requests per endpoint
   - Identify peak usage times

## Current Status

Based on the error you're seeing (`PUBLIC_API_BILLING_LIMIT_EXCEEDED`), you're likely:
- On **Free Plan** (1,000/month) and exceeding it
- Or on **Plus Plan** (5,000/month) and approaching limit

## Action Items

1. ✅ **Immediate**: Upgrade Airtable plan to Pro (50,000/month)
2. ✅ **Short-term**: Implement caching for brand profiles
3. ✅ **Medium-term**: Optimize publishing job frequency
4. ✅ **Long-term**: Move frequently-accessed data to Supabase

## Code Locations for Optimization

- **Brand Profiles Caching**: `src/app/api/brands/route.ts`, `src/app/(app)/dashboard/page.tsx`
- **Content Queue Optimization**: `src/app/api/content/queue/route.ts`
- **Publishing Job**: `src/app/api/publish/linkedin-due/route.ts`
- **Brand Name Lookups**: `src/app/api/content/queue/route.ts` (lines 200-245)
