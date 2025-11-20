# LinkedIn Analytics Setup

## Overview

This document outlines the setup and implementation of LinkedIn analytics for published posts, including impressions, clicks, and engagement metrics.

## Current Status

✅ **Completed:**
- LinkedIn post ID is now stored in Airtable (`linkedin_post_id` field) when content is published
- Basic infrastructure in place for analytics fetching

⏳ **Pending:**
- LinkedIn Analytics API integration (requires additional research and permissions)
- Analytics data storage in Airtable
- Dashboard display of analytics

## LinkedIn Analytics API

LinkedIn provides analytics through different APIs depending on the post type:

### For UGC Posts (Personal Profiles)
- **API Endpoint:** LinkedIn UGC Posts API may provide basic metrics
- **Permissions Required:** `r_liteprofile` or `r_basicprofile` + analytics permissions
- **Limitations:** Personal profile analytics may be limited compared to Company Pages

### For Company Page Posts
- **API Endpoint:** LinkedIn Marketing Developer Platform Analytics API
- **Permissions Required:** `r_organization_social` or `w_organization_social`
- **Available Metrics:** Impressions, clicks, engagement, shares, comments, likes

## Implementation Plan

### Phase 1: Store LinkedIn Post ID ✅
- [x] Update `updateAirtableRecord` to accept `linkedin_post_id`
- [x] Store `linkedin_post_id` from `publishResult` when publishing

### Phase 2: Airtable Schema Updates
Add the following fields to `ContentQueue` table in Airtable:

1. **linkedin_post_id** (Single line text)
   - Stores the LinkedIn URN or post ID
   - Format: `urn:li:ugcPost:{id}` or just the ID

2. **analytics_impressions** (Number)
   - Total impressions/views of the post

3. **analytics_clicks** (Number)
   - Total clicks on the post

4. **analytics_engagement** (Number)
   - Total engagement (likes + comments + shares)

5. **analytics_likes** (Number)
   - Number of likes

6. **analytics_comments** (Number)
   - Number of comments

7. **analytics_shares** (Number)
   - Number of shares

8. **analytics_last_updated** (Date with time)
   - Timestamp of last analytics fetch

### Phase 3: Analytics Fetching API

Create `/api/analytics/linkedin` endpoint that:
1. Fetches published LinkedIn posts from Airtable
2. For each post with `linkedin_post_id`:
   - Calls LinkedIn Analytics API
   - Updates Airtable with metrics
   - Handles rate limits and errors gracefully

### Phase 4: Dashboard Display

Update dashboard to show:
- Analytics summary cards (total impressions, clicks, engagement)
- Per-post analytics in content approval/schedule views
- Charts/graphs for trends over time

## LinkedIn API Research Needed

1. **UGC Posts Analytics Endpoint:**
   - Check if `/v2/ugcPosts/{id}/analytics` exists
   - Verify required permissions
   - Understand rate limits

2. **Alternative Approaches:**
   - Web scraping (not recommended, violates ToS)
   - LinkedIn Webhooks (if available)
   - Manual import from LinkedIn Analytics dashboard

## Notes

- LinkedIn analytics may have a delay (24-48 hours) before metrics are available
- Rate limits apply to analytics API calls
- Some metrics may only be available for Company Pages, not personal profiles
- Consider caching analytics data to reduce API calls

## Next Steps

1. Research LinkedIn UGC Posts Analytics API documentation
2. Test API endpoints with existing LinkedIn connections
3. Implement analytics fetching function
4. Add analytics fields to Airtable
5. Create dashboard components to display metrics

