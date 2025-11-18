# Content Publishing Workflow for LinkedIn Articles

## Current Workflow (When Content is Approved)

### 1. User Approves Content
- User clicks "Approve" button on `/content/approval` page
- Frontend calls: `PATCH /api/content/queue/{contentId}`
- Payload: `{ action: 'approve' }`

### 2. Backend Updates Airtable
- Status changes to: `"Ready To Publish"`
- `approved_at` timestamp is set
- Content record is updated in `ContentQueue` table

### 3. **MISSING: Publishing Trigger** ⚠️
Currently, there is **no automatic publishing** after approval. The content just sits in "Ready To Publish" status.

---

## Proposed Complete Workflow

### Step 1: Approval → Trigger Publishing Webhook
When content is approved:
1. Update Airtable status to `"Ready To Publish"`
2. **Trigger Make.com webhook** to schedule/publish content
3. Make.com receives:
   - Content details (title, body, hashtags, image)
   - Platform (LinkedIn, X, etc.)
   - Scheduled time
   - Brand profile ID
   - User ID

### Step 2: Make.com Scenario Handles Publishing
Make.com scenario should:
1. **Fetch LinkedIn credentials** from Supabase `connections` table
   - Get access token for the user
   - Refresh token if expired
2. **Check scheduled time**:
   - If `scheduled_time` is in the future → Schedule post
   - If `scheduled_time` is now/past → Publish immediately
3. **Publish to LinkedIn**:
   - For **LinkedIn Articles**: Use LinkedIn UGC API
   - For **LinkedIn Posts**: Use LinkedIn Share API
   - Include image if available
   - Include hashtags
4. **Update Airtable**:
   - Set `status` to `"Published"`
   - Set `published_at` timestamp
   - Store `published_url` (if available)
5. **Increment usage**:
   - Call `POST /api/usage/increment`
   - Body: `{ userId, count: 1 }`

### Step 3: Scheduling vs Immediate Publishing

#### Option A: Immediate Publishing
- If `scheduled_time` is null or in the past
- Publish immediately via LinkedIn API
- Update status to "Published"

#### Option B: Scheduled Publishing
- If `scheduled_time` is in the future
- Two approaches:
  1. **Use LinkedIn's native scheduling** (if available)
  2. **Use Make.com's scheduler** to trigger at scheduled time
  3. **Use Buffer/Hootsuite** as intermediary (if integrated)

---

## Implementation Details

### Environment Variables Needed
```bash
MAKE_CONTENT_PUBLISH_WEBHOOK_URL=https://hook.eu2.make.com/...
MAKE_API_KEY=your_make_api_key (optional, for authentication)
```

### API Endpoint: Content Approval
**File:** `src/app/api/content/queue/[contentId]/route.ts`

**Current behavior:**
- Updates status to "Ready To Publish"
- Does NOT trigger publishing webhook

**Needs to:**
- After updating Airtable, trigger Make.com webhook
- Pass all content details to Make.com

### Make.com Webhook Payload
```json
{
  "content_id": "recXXXXXXXXXXXXXX",
  "brand_profile_id": "recXXXXXXXXXXXXXX",
  "user_id": "uuid-here",
  "platform": "LinkedIn",
  "content_type": "Article", // or "Post"
  "title": "Article title",
  "content": "Full article content...",
  "hook": "Post hook/headline",
  "hashtags": "#marketing #ai",
  "image_prompt": "AI prompt for image",
  "image_generation_source": "AI Generated",
  "scheduled_time": "2025-01-15T10:00:00Z", // ISO string or null
  "approved_at": "2025-01-14T15:30:00Z"
}
```

### LinkedIn Publishing Options

#### 1. LinkedIn UGC API (Articles)
- **Endpoint**: `POST https://api.linkedin.com/v2/ugcPosts`
- **Required**: Access token with `w_member_social` scope
- **Use case**: Long-form articles

#### 2. LinkedIn Share API (Posts)
- **Endpoint**: `POST https://api.linkedin.com/v2/shares`
- **Required**: Access token with `w_member_social` scope
- **Use case**: Short posts with images

#### 3. Buffer/Hootsuite Integration
- **Option**: Use Buffer API as intermediary
- **Benefit**: Built-in scheduling, analytics
- **Requires**: Buffer account connection

---

## Current Status

### ✅ What's Working
- Content approval updates Airtable status
- Content queue displays approved items
- Scheduled time can be edited
- LinkedIn OAuth connection exists

### ❌ What's Missing
- Publishing webhook trigger on approval
- Make.com scenario for LinkedIn publishing
- Usage increment after publishing
- Published status update in Airtable

---

## Next Steps

1. **Add publishing webhook trigger** to approval endpoint
2. **Create Make.com scenario** for LinkedIn publishing
3. **Test publishing flow** end-to-end
4. **Add error handling** for failed publishes
5. **Implement retry logic** for failed publishes

---

## Questions to Answer

1. **Do we want immediate publishing or scheduling?**
   - If scheduling: Use LinkedIn native scheduling or Make.com scheduler?

2. **What happens if LinkedIn publish fails?**
   - Retry automatically?
   - Set status to "Failed"?
   - Notify user?

3. **Do we need Buffer/Hootsuite integration?**
   - Or publish directly to LinkedIn?

4. **How do we handle images?**
   - Generate image first via Make.com?
   - Upload to LinkedIn before publishing?

