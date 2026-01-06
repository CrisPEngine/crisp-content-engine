# Future ContentQueue Fields

These fields are referenced in the code but **do not currently exist** in your Airtable ContentQueue table. They are optional enhancements that can be added in the future.

## 1. `image_cloudinary_id` (Single Line Text)

### Current Status
❌ **Not in Airtable** - Removed from fields[] array

### Purpose
Stores the Cloudinary image ID when images are uploaded to Cloudinary for content.

### Where It's Used
- **`/api/content/queue/[contentId]/route.ts`**: When uploading images via PATCH endpoint, the code attempts to store the Cloudinary ID:
  ```typescript
  image_cloudinary_id: String(cloudinaryId)
  ```
- **`/app/(app)/content/approval/page.tsx`**: The approval page UI expects this field to display/manage uploaded images

### Future Use Cases
- **Image Management**: Track which images are stored in Cloudinary vs. external URLs
- **Image Optimization**: Use Cloudinary IDs to generate optimized image variants
- **Image Cleanup**: Identify and clean up unused Cloudinary images
- **CDN Performance**: Cloudinary provides CDN delivery for better image performance

### When to Add
Add this field when you:
- Start using Cloudinary for image storage
- Need to track image uploads separately from `image_reference_url`
- Want to manage images through Cloudinary's API

---

## 2. `summary` (Long Text)

### Current Status
❌ **Not in Airtable** - Removed from fields[] array

### Purpose
Stores a brief summary or description of the content piece.

### Where It's Used
- **`/api/content/queue/route.ts`**: The API returns `summary` in the ContentItem type, with fallback to `content_summary`:
  ```typescript
  summary: getField('summary') || getField('content_summary') || ''
  ```
- **`/app/(app)/content/schedule/page.tsx`**: Used for content previews:
  ```typescript
  content_preview: item.summary || item.content || ''
  ```

### Future Use Cases
- **Content Previews**: Show brief summaries in content lists without loading full content
- **Content Discovery**: Help users quickly identify content pieces
- **Email Previews**: Include summaries in notification emails
- **Search/Filtering**: Enable content search by summary text

### When to Add
Add this field when you:
- Want to show content previews in lists
- Need better content organization and discovery
- Want to enhance email notifications with summaries

### Note
The code currently falls back to `content_summary` if `summary` doesn't exist, so this is a low-priority enhancement.

---

## 3. `content_type` (Single Select or Text)

### Current Status
❌ **Not in Airtable** - Removed from fields[] array

### Purpose
Categorizes the type of content (e.g., "Post", "Article", "Video", "Carousel", "Story").

### Where It's Used
- **`/api/content/queue/route.ts`**: The API returns `content_type` in the ContentItem type, defaulting to "Post":
  ```typescript
  content_type: getField('content_type') || 'Post'
  ```
- **`/app/(app)/content/approval/page.tsx`**: Displays content type in the approval UI:
  ```typescript
  {item.content_type && (
    <span>{item.content_type}</span>
  )}
  ```

### Future Use Cases
- **Content Filtering**: Filter content by type (e.g., show only "Video" content)
- **Platform-Specific Logic**: Different publishing logic for videos vs. posts
- **Analytics**: Track performance by content type
- **Content Strategy**: Organize content strategy by type
- **UI Display**: Show content type badges/icons in the UI

### When to Add
Add this field when you:
- Start creating different types of content (videos, carousels, etc.)
- Need to filter or organize content by type
- Want to implement type-specific publishing logic
- Need analytics by content type

### Suggested Options
If you add this field, consider these options:
- `"Post"` (default)
- `"Article"`
- `"Video"`
- `"Carousel"`
- `"Story"`
- `"Reel"`
- `"Thread"`

---

## Implementation Notes

### Current Behavior
- All three fields are **optional** in the code
- The code handles missing fields gracefully with fallbacks or defaults
- Removing them from the `fields[]` array prevents `UNKNOWN_FIELD_NAME` errors

### Adding These Fields Later
When you're ready to add these fields:

1. **Add to Airtable**:
   - Create the field in your ContentQueue table
   - Use the exact field names: `image_cloudinary_id`, `summary`, `content_type`

2. **Get Field IDs**:
   - Go to Airtable → ContentQueue → Manage fields
   - Copy the Field ID for each new field
   - Format: `fld...`

3. **Update Code**:
   - Add field IDs to `CONTENTQUEUE_FIELD_IDS` in both:
     - `src/app/api/publish/linkedin-due/route.ts`
     - `src/app/api/content/queue/route.ts`
   - Add field names back to `fields[]` arrays
   - Update `getField()` calls to use the field IDs

4. **Test**:
   - Verify fields are returned in API responses
   - Check that UI displays the fields correctly
   - Ensure no `UNKNOWN_FIELD_NAME` errors

### Priority Recommendation
1. **High Priority**: `content_type` - Most useful for content organization and filtering
2. **Medium Priority**: `summary` - Enhances UX but has fallback (`content_summary`)
3. **Low Priority**: `image_cloudinary_id` - Only needed if using Cloudinary
