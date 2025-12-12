# ContentQueue Table - Complete Field Reference

This document lists ALL fields that should exist in your ContentQueue table in Airtable, based on what the application code actually uses.

## Required Fields

### 1. `hook` (Single Line Text) - **REQUIRED**
- **Purpose**: Post title/subject/hook
- **Fallback fields**: `title`, `post_title` (code checks these if `hook` is missing)
- **Used by**: Content display, publishing

### 2. `post_content` (Long Text) - **REQUIRED**
- **Purpose**: Full content text of the post
- **Fallback fields**: `content`, `post_body` (code checks these if `post_content` is missing)
- **Used by**: Content display, publishing

### 3. `status` (Single Select) - **REQUIRED**
- **Purpose**: Tracks approval/publishing status
- **Options**: 
  - `"Needs Approval"` (for approval queue)
  - `"Needs Copy"` (for approval queue)
  - `"Needs Review"` (for approval queue)
  - `"Scheduled"` (for schedule queue)
  - `"Ready To Publish"` (for schedule queue)
  - `"Published"` (for schedule queue)
  - `"Failed"` (for schedule queue)
  - `"Draft"` (for draft content)
- **Default for new content**: `"Needs Approval"`

### 4. `platform` (Single Select or Text) - **REQUIRED**
- **Purpose**: Platform name
- **Options**: LinkedIn, X, Blog, Instagram, Facebook, Medium, etc.
- **Used by**: Content filtering, publishing logic

### 5. `brand_profile_id` (Link to BrandProfiles) - **REQUIRED**
- **Type**: Link field (must link to BrandProfiles table)
- **Purpose**: Links content to the brand profile
- **Used by**: User filtering, content organization
- **Note**: This MUST be a LINK field, not a text field

## Optional but Recommended Fields

### 6. `hashtags` (Single Line Text or Long Text) - **OPTIONAL**
- **Purpose**: Hashtags for the post
- **Used by**: Content display, publishing

### 7. `image_prompt` (Long Text) - **OPTIONAL**
- **Purpose**: AI image generation prompt
- **Used by**: Image generation workflows

### 8. `scheduled_time` (Date/Date with time) - **OPTIONAL**
- **Purpose**: When the content should be published
- **Fallback field**: `scheduled_date` (code checks this if `scheduled_time` is missing)
- **Used by**: Publishing cron job, scheduling logic
- **Note**: Should be stored in UTC

### 9. `published_at` (Date/Date with time) - **OPTIONAL**
- **Purpose**: When the content was actually published
- **Used by**: Publishing tracking, analytics

### 10. `summary` (Long Text) - **OPTIONAL**
- **Purpose**: Content summary/description
- **Fallback field**: `content_summary` (code checks this if `summary` is missing)
- **Used by**: Content display

### 11. `call_to_action` (Single Line Text) - **OPTIONAL**
- **Purpose**: CTA text for the content
- **Used by**: Content display

### 12. `image_generation_source` (Single Select or Text) - **OPTIONAL**
- **Purpose**: Source for image generation (e.g., "AI Generated", "Stock", "Brand")
- **Used by**: Image generation workflows

### 13. `image_reference_url` (URL or Single Line Text) - **OPTIONAL**
- **Purpose**: URL reference for image
- **Used by**: Image handling, publishing

### 14. `image_cloudinary_id` (Single Line Text) - **OPTIONAL**
- **Purpose**: Cloudinary image ID if using Cloudinary
- **Used by**: Image handling

### 15. `content_type` (Single Select or Text) - **OPTIONAL**
- **Purpose**: Type of content (e.g., "Post", "Article", "Video")
- **Default**: "Post"
- **Used by**: Content display

### 16. `publish_attempts` (Number) - **OPTIONAL**
- **Purpose**: Number of times publishing was attempted
- **Default**: 0
- **Used by**: Publishing retry logic

### 17. `publish_error` (Long Text) - **OPTIONAL**
- **Purpose**: Error message if publishing failed
- **Used by**: Error tracking, retry logic

### 18. `linkedin_post_id` (Single Line Text) - **OPTIONAL**
- **Purpose**: LinkedIn post ID after successful publishing
- **Used by**: Duplicate prevention, status sync

### 19. `published_url` (URL or Single Line Text) - **OPTIONAL**
- **Purpose**: URL of published post
- **Used by**: Duplicate prevention, status sync

## Fields That Should NOT Exist

### ❌ `body_draft` - **DO NOT CREATE THIS FIELD**
- Make.com is trying to write this field, but it does NOT exist in ContentQueue
- **Action**: Remove `body_draft` from your Make.com scenario's Airtable "Create Record" module
- **Reason**: This field is not used by the application and will cause 422 errors

## Make.com Configuration

When creating ContentQueue records in Make.com, ensure:

✅ **DO include these fields:**
- `hook` (or `title`/`post_title` as fallback)
- `post_content` (or `content`/`post_body` as fallback)
- `status` (set to `"Needs Approval"` for new content)
- `platform` (e.g., "LinkedIn", "Blog", "X")
- `brand_profile_id` (as a LINK field, not text)
- `hashtags` (if available)
- `image_prompt` (if available)
- `scheduled_time` (if content should be scheduled)

❌ **DO NOT include these fields:**
- `body_draft` - This field does not exist and will cause errors
- Any other fields not listed above (unless you've added them for custom use)

## Field Name Priority (for code compatibility)

The code checks fields in this order:

**Title**: `hook` → `title` → `post_title` → `"Untitled"`
**Content**: `post_content` → `content` → `post_body` → `""`
**Scheduled Date**: `scheduled_time` → `scheduled_date` → `null`
**Summary**: `summary` → `content_summary` → `""`

## Fixing the Current Error

The error `[422] Unknown field name: "body_draft"` means Make.com is trying to write a field that doesn't exist.

**Solution:**
1. Open your Make.com scenario "next-Strategy-creation"
2. Find the Airtable "Create Record" module that creates ContentQueue records
3. Remove the `body_draft` field from the field mapping
4. Save and test the scenario

The `body_draft` field should NOT be written to Airtable. If Make.com needs to store draft content internally, it should use a Make.com variable or data store, not Airtable.
