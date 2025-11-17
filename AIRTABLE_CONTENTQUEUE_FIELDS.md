# Airtable ContentQueue Table - Required Fields

This document lists the fields that should exist in your ContentQueue table in Airtable.

## Required Fields

### 1. `brand_profile_id` (Link to BrandProfiles)
- **Type**: Link field
- **Linked Table**: BrandProfiles
- **Required**: Yes
- **Purpose**: Links each content item to a brand profile, allowing the app to filter content by user (since users own brand profiles)

### 2. `status` (Single Select)
- **Type**: Single select
- **Options**: 
  - "Needs Approval"
  - "Needs Copy"
  - "Needs Review"
  - "Scheduled"
  - "Ready To Publish"
  - "Published"
  - "Failed"
  - "Draft"
- **Required**: Yes
- **Purpose**: Tracks the approval/publishing status of content

### 3. `platform` (Single Select or Text)
- **Type**: Single select or Text
- **Options**: LinkedIn, X, Blog, Instagram, Facebook, Medium, etc.
- **Required**: Yes
- **Purpose**: Indicates which platform the content is for

### 4. `post_title` or `title` (Single Line Text)
- **Type**: Single line text
- **Required**: Yes
- **Purpose**: The title/subject of the content

### 5. `post_content` or `content` or `post_body` (Long Text)
- **Type**: Long text
- **Required**: Yes
- **Purpose**: The full content text

## Optional but Recommended Fields

### 6. `scheduled_date` (Date/Date with time)
- **Type**: Date/Date with time
- **Required**: No (but recommended)
- **Purpose**: When the content should be published
- **Note**: Currently commented out in the code until this field is added

### 7. `published_at` (Date/Date with time)
- **Type**: Date/Date with time
- **Required**: No
- **Purpose**: When the content was actually published

### 8. `brand_name` or `client_name` (Single Line Text)
- **Type**: Single line text
- **Required**: No
- **Purpose**: Display name of the brand (can be derived from brand_profile_id link)

### 9. `summary` or `content_summary` (Long Text)
- **Type**: Long text
- **Required**: No
- **Purpose**: Summary/description of the content

### 10. `call_to_action` (Single Line Text)
- **Type**: Single line text
- **Required**: No
- **Purpose**: CTA text for the content

## Field Name Variations

The code handles multiple field name variations for compatibility:

- **Title**: `title` OR `post_title`
- **Content**: `content` OR `post_body` OR `post_content`
- **Summary**: `summary` OR `content_summary`
- **Brand Name**: `brand_name` OR `client_name`

## Current Implementation

The API currently:
1. Fetches all content from ContentQueue (filtered by status if provided)
2. Filters results in code by `brand_profile_id` to show only content for the user's brands
3. This works even if `brand_profile_id` field doesn't exist yet (will return empty results)

## To Add the `brand_profile_id` Field

1. Go to your ContentQueue table in Airtable
2. Add a new field called `brand_profile_id`
3. Set the field type to "Link to another record"
4. Select "BrandProfiles" as the linked table
5. Save the field

Once this field is added and content items are linked to brand profiles, the filtering will work correctly.

## Performance Note

Currently, the API fetches all content and filters in code. Once `brand_profile_id` exists, we can optimize by filtering in the Airtable formula instead. However, the current approach works and is safer until the field structure is confirmed.

