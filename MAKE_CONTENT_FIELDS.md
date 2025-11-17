# Make.com Content Generation - Required Airtable Fields

This document specifies the exact field names that Make.com must populate when creating ContentQueue records.

## Required Fields in ContentQueue Table

### 1. `hook` (Single Line Text) - **REQUIRED**
- **Field Name**: `hook`
- **Purpose**: Post title/subject
- **Note**: The code also checks `title` and `post_title` as fallbacks, but `hook` is the primary field

### 2. `post_content` (Long Text) - **REQUIRED**
- **Field Name**: `post_content`
- **Purpose**: Full content text
- **Note**: The code also checks `content` and `post_body` as fallbacks, but `post_content` is the primary field

### 3. `status` (Single Select) - **REQUIRED**
- **Field Name**: `status`
- **Options**: Must be exactly one of:
  - `"Needs Approval"` (for approval queue)
  - `"Needs Copy"` (for approval queue)
  - `"Needs Review"` (for approval queue)
  - `"Scheduled"` (for schedule queue)
  - `"Ready To Publish"` (for schedule queue)
  - `"Published"` (for schedule queue)
  - `"Failed"` (for schedule queue)
- **Default for new content**: `"Needs Approval"`

### 4. `platform` (Single Select or Text) - **REQUIRED**
- **Field Name**: `platform`
- **Purpose**: Platform name (LinkedIn, X, Blog, Instagram, Facebook, Medium, etc.)

### 5. `brand_profile_id` (Link to BrandProfiles) - **REQUIRED**
- **Field Name**: `brand_profile_id`
- **Type**: Link field (must link to BrandProfiles table)
- **Purpose**: Links content to the brand profile
- **Note**: This must be a LINK field, not a text field. Make.com must link the record.

### 6. `scheduled_time` (Date/Date with time) - **OPTIONAL**
- **Field Name**: `scheduled_time`
- **Purpose**: When the content should be published
- **Note**: The code also checks `scheduled_date` as a fallback

## Optional Fields

### 7. `hashtags` (Single Line Text or Long Text) - **OPTIONAL**
- **Field Name**: `hashtags`
- **Purpose**: Hashtags for the post

### 8. `image_prompt` (Long Text) - **OPTIONAL**
- **Field Name**: `image_prompt`
- **Purpose**: AI image generation prompt

### 9. `image_generation_source` (Single Select or Text) - **OPTIONAL**
- **Field Name**: `image_generation_source`
- **Purpose**: Source for image generation (e.g., "AI Generated", "Stock", "Brand")

### 10. `summary` (Long Text) - **OPTIONAL**
- **Field Name**: `summary`
- **Purpose**: Content summary/description
- **Note**: Code also checks `content_summary` as fallback

### 11. `call_to_action` (Single Line Text) - **OPTIONAL**
- **Field Name**: `call_to_action`
- **Purpose**: CTA text for the content

## Make.com Configuration Checklist

When creating ContentQueue records in Make.com, ensure:

- [ ] `hook` field is populated with the post title
- [ ] `post_content` field is populated with the full content text
- [ ] `status` field is set to exactly `"Needs Approval"` (for approval queue)
- [ ] `platform` field is populated (e.g., "LinkedIn", "Blog", "X")
- [ ] `brand_profile_id` is linked to the BrandProfiles record (not just text)
- [ ] `scheduled_time` is set if content should be scheduled
- [ ] Optional fields (`hashtags`, `image_prompt`, etc.) are populated if available

## Common Issues

### Issue 1: Content appears but fields are empty
**Cause**: Make.com is creating records but not populating fields
**Solution**: Check that Make.com's Airtable "Create Record" module is mapping all fields correctly

### Issue 2: Content doesn't appear in approval queue
**Cause**: Status field is not set to "Needs Approval", "Needs Copy", or "Needs Review"
**Solution**: Ensure Make.com sets `status` to exactly `"Needs Approval"` (case-sensitive)

### Issue 3: Content appears for wrong user
**Cause**: `brand_profile_id` is not linked correctly
**Solution**: Ensure `brand_profile_id` is a Link field in Airtable, and Make.com is linking the record (not setting text)

### Issue 4: Title shows as "Untitled"
**Cause**: `hook` field is empty
**Solution**: Ensure Make.com populates the `hook` field with the post title

## Field Name Priority (for code compatibility)

The code checks fields in this order:

**Title**: `hook` → `title` → `post_title` → `"Untitled"`
**Content**: `post_content` → `content` → `post_body` → `""`
**Scheduled Date**: `scheduled_time` → `scheduled_date` → `null`
**Summary**: `summary` → `content_summary` → `""`

## Testing

After Make.com creates content:
1. Check Airtable directly to verify all fields are populated
2. Visit `/api/content/debug` to see what the API sees
3. Check server logs for `[CONTENT WEBHOOK]` messages
4. Verify content appears in `/content/approval` page

